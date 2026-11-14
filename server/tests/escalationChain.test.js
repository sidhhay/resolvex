/**
 * Chain of Responsibility — the SLA escalation policy.
 * The chain is pure decision-making, so these tests need no database.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEscalationChain,
  idleDaysFor,
  EscalationHandler,
  Level1HodHandler,
  TerminalStateHandler,
} from '../src/services/escalation/chain.js';

const HOD = { id: 5, name: 'HOD IT', email: 'hod.it@resolvex.edu' };
const DEAN = { id: 1, name: 'Dr. Meera Dean', email: 'dean@resolvex.edu' };

/**
 * @param {{ status?: string, escalationLevel?: number, idleDays?: number }} [o]
 */
function contextFor(o = {}) {
  return {
    complaint: /** @type {any} */ ({
      id: 42,
      status: o.status ?? 'Assigned',
      escalation_level: o.escalationLevel ?? 0,
      department_name: 'IT & Network Services',
      last_activity_at: new Date(Date.now() - (o.idleDays ?? 0) * 86_400_000),
    }),
    idleDays: o.idleDays ?? 0,
    thresholds: { level1Days: 3, level2Days: 5 },
    resolveHod: async () => /** @type {any} */ (HOD),
    resolveAuthority: async () => /** @type {any} */ (DEAN),
  };
}

test('a complaint inside its service window is left alone', async () => {
  const decision = await buildEscalationChain().handle(contextFor({ idleDays: 2.9 }));
  assert.equal(decision.action, 'skip');
  assert.equal(decision.handledBy, 'RecentActivityHandler');
});

test('three days idle escalates to the Head of Department', async () => {
  const decision = await buildEscalationChain().handle(contextFor({ idleDays: 3.2 }));
  assert.equal(decision.action, 'escalate');
  assert.equal(decision.level, 1);
  assert.equal(decision.target?.email, HOD.email);
  assert.equal(decision.handledBy, 'Level1HodHandler');
  assert.match(decision.reason, /3-day threshold/);
});

test('five days idle escalates to the Dean, skipping level 1 if it was missed', async () => {
  const decision = await buildEscalationChain().handle(contextFor({ idleDays: 7, escalationLevel: 0 }));
  assert.equal(decision.level, 2);
  assert.equal(decision.target?.email, DEAN.email);
  assert.equal(decision.handledBy, 'Level2DeanHandler');
  assert.match(decision.reason, /level-1 window elapsed/);
});

test('an unanswered level-1 escalation moves up to the Dean', async () => {
  const decision = await buildEscalationChain().handle(
    contextFor({ idleDays: 5.5, escalationLevel: 1, status: 'Escalated' }),
  );
  assert.equal(decision.level, 2);
  assert.match(decision.reason, /went unanswered/);
});

test('a level-1 complaint still inside the level-2 window is not re-escalated', async () => {
  const decision = await buildEscalationChain().handle(
    contextFor({ idleDays: 4, escalationLevel: 1, status: 'Escalated' }),
  );
  // Level 2's threshold is not met and level 1 is already recorded, so the
  // chain falls through to its terminal link rather than acting twice.
  assert.equal(decision.action, 'none');
  assert.equal(decision.handledBy, 'NoActionHandler');
});

test('the top of the hierarchy is the end of the road', async () => {
  const decision = await buildEscalationChain().handle(
    contextFor({ idleDays: 40, escalationLevel: 2, status: 'Escalated' }),
  );
  assert.equal(decision.action, 'skip');
  assert.equal(decision.handledBy, 'MaxLevelHandler');
});

test('finished work has no SLA left to breach', async () => {
  for (const status of ['Resolved', 'Closed']) {
    const decision = await buildEscalationChain().handle(contextFor({ idleDays: 90, status }));
    assert.equal(decision.action, 'skip');
    assert.equal(decision.handledBy, 'TerminalStateHandler');
  }
});

test('the chain is extensible: a new link can pre-empt the defaults', async () => {
  /** A hypothetical policy: VIP complaints escalate straight to the Dean. */
  class VipHandler extends EscalationHandler {
    /**
     * @param {import('../src/services/escalation/chain.js').EscalationContext} context
     * @returns {Promise<Omit<import('../src/services/escalation/chain.js').EscalationDecision, 'handledBy'> | null>}
     */
    async evaluate({ complaint, resolveAuthority }) {
      if (!/** @type {any} */ (complaint).vip) return null;
      return { action: 'escalate', level: 2, target: await resolveAuthority(), reason: 'VIP policy.' };
    }
  }

  const head = new VipHandler();
  head.setNext(new TerminalStateHandler()).setNext(new Level1HodHandler());

  const context = contextFor({ idleDays: 0 });
  /** @type {any} */ (context.complaint).vip = true;

  const decision = await head.handle(context);
  assert.equal(decision.handledBy, 'VipHandler');
  assert.equal(decision.level, 2);
});

test('idleDaysFor measures from last_activity_at and never goes negative', () => {
  const now = new Date('2026-01-10T00:00:00Z');
  assert.equal(
    idleDaysFor(/** @type {any} */ ({ last_activity_at: new Date('2026-01-07T00:00:00Z') }), now),
    3,
  );
  // A clock skew that puts activity in the future must not read as "overdue".
  assert.equal(
    idleDaysFor(/** @type {any} */ ({ last_activity_at: new Date('2026-01-11T00:00:00Z') }), now),
    0,
  );
});
