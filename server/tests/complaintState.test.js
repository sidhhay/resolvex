/**
 * State pattern — the transition rules that keep the complaint lifecycle honest.
 * Pure unit tests: no database, no HTTP.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getState,
  planTransition,
  buildPatch,
  COMPLAINT_STATUSES,
  isComplaintStatus,
} from '../src/domain/complaintState.js';
import { ForbiddenError, InvalidTransitionError } from '../src/domain/errors.js';

/**
 * @param {Partial<import('../src/domain/complaintState.js').ComplaintSnapshot>} [overrides]
 * @returns {import('../src/domain/complaintState.js').ComplaintSnapshot}
 */
function complaint(overrides = {}) {
  return {
    id: 1,
    status: 'Submitted',
    assigned_to: null,
    department_id: 7,
    escalation_level: 0,
    assigned_at: null,
    resolved_at: null,
    ...overrides,
  };
}

const handler = { id: 10, role: /** @type {const} */ ('handler'), isDepartmentMember: true };
const student = { id: 20, role: /** @type {const} */ ('student'), isCreator: true };
const admin = { id: 30, role: /** @type {const} */ ('admin') };
const system = { id: null, role: /** @type {const} */ ('system') };

test('every declared status resolves to a state object', () => {
  for (const status of COMPLAINT_STATUSES) {
    assert.equal(getState(status).name, status);
    assert.ok(isComplaintStatus(status));
  }
  assert.equal(isComplaintStatus('Pending'), false);
  assert.throws(() => getState('Pending'), InvalidTransitionError);
});

test('Closed is the only terminal state and rejects every move', () => {
  const terminal = COMPLAINT_STATUSES.filter((s) => getState(s).isTerminal);
  assert.deepEqual(terminal, ['Closed']);

  assert.throws(
    () =>
      planTransition({
        complaint: complaint({ status: 'Closed' }),
        actor: admin,
        to: 'Investigating',
        payload: {},
      }),
    /can no longer be changed/,
  );
});

test('a student cannot skip the queue and start an investigation', () => {
  assert.throws(
    () => planTransition({ complaint: complaint(), actor: student, to: 'Investigating', payload: {} }),
    InvalidTransitionError,
  );
});

test('assignment requires an assignee', () => {
  assert.throws(
    () => planTransition({ complaint: complaint(), actor: handler, to: 'Assigned', payload: {} }),
    /Select the handler/,
  );

  const { patch } = planTransition({
    complaint: complaint(),
    actor: handler,
    to: 'Assigned',
    payload: { assignedTo: 10 },
  });
  assert.equal(patch.status, 'Assigned');
  assert.equal(patch.assigned_to, 10);
  assert.ok(patch.assigned_at instanceof Date);
});

test('a handler from another department is refused', () => {
  assert.throws(
    () =>
      planTransition({
        complaint: complaint({ status: 'Assigned', assigned_to: 99 }),
        actor: { id: 11, role: 'handler', isDepartmentMember: false, isAssignee: false },
        to: 'Investigating',
        payload: {},
      }),
    ForbiddenError,
  );
});

test('resolving demands a substantive resolution note', () => {
  const investigating = complaint({ status: 'Investigating', assigned_to: 10 });

  assert.throws(
    () => planTransition({ complaint: investigating, actor: handler, to: 'Resolved', payload: {} }),
    /resolution note is required/,
  );
  assert.throws(
    () =>
      planTransition({
        complaint: investigating,
        actor: handler,
        to: 'Resolved',
        payload: { resolutionNote: 'fixed' },
      }),
    /at least 10 characters/,
  );

  const { patch } = planTransition({
    complaint: investigating,
    actor: handler,
    to: 'Resolved',
    payload: { resolutionNote: 'Replaced the failing access point and verified throughput.' },
  });
  assert.equal(patch.status, 'Resolved');
  assert.ok(patch.resolved_at instanceof Date);
});

test('only the complainant (or an admin) may close or reopen a resolution', () => {
  const resolved = complaint({ status: 'Resolved', assigned_to: 10, resolved_at: new Date() });

  // The handler who resolved it cannot also declare it closed.
  assert.throws(
    () => planTransition({ complaint: resolved, actor: handler, to: 'Closed', payload: {} }),
    ForbiddenError,
  );

  const { patch } = planTransition({ complaint: resolved, actor: student, to: 'Closed', payload: {} });
  assert.equal(patch.status, 'Closed');
  assert.ok(patch.closed_at instanceof Date);
});

test('reopening a resolved complaint clears resolved_at so SLA stays truthful', () => {
  const resolved = complaint({ status: 'Resolved', assigned_to: 10, resolved_at: new Date() });

  assert.throws(
    () => planTransition({ complaint: resolved, actor: student, to: 'Investigating', payload: {} }),
    /reason for reopening/,
  );

  const { patch } = planTransition({
    complaint: resolved,
    actor: student,
    to: 'Investigating',
    payload: { reason: 'The wifi dropped again this morning; it is not fixed.' },
  });
  assert.equal(patch.status, 'Investigating');
  assert.equal(patch.resolved_at, null);
});

test('escalation is system/admin only and the level must strictly increase', () => {
  const stale = complaint({ status: 'Assigned', assigned_to: 10 });
  const reason = 'No activity for 4.0 days, exceeding the 3-day threshold.';

  assert.throws(
    () =>
      planTransition({
        complaint: stale,
        actor: handler,
        to: 'Escalated',
        payload: { escalationLevel: 1, reason },
      }),
    ForbiddenError,
  );

  const { patch } = planTransition({
    complaint: stale,
    actor: system,
    to: 'Escalated',
    payload: { escalationLevel: 1, reason, assignedTo: 42 },
  });
  assert.equal(patch.escalation_level, 1);
  assert.equal(patch.assigned_to, 42);

  // Re-escalating to a level already reached is what stops the cron looping.
  assert.throws(
    () =>
      planTransition({
        complaint: complaint({ status: 'Escalated', escalation_level: 2 }),
        actor: system,
        to: 'Escalated',
        payload: { escalationLevel: 2, reason },
      }),
    /already escalated to level 2/,
  );
});

test('time to assignment measures the first owner, not the latest', () => {
  const firstAssignedAt = new Date('2026-01-01T10:00:00Z');
  const patch = buildPatch(
    {
      complaint: complaint({ status: 'Investigating', assigned_to: 10, assigned_at: firstAssignedAt }),
      actor: handler,
      to: 'Assigned',
      payload: { assignedTo: 11 },
    },
    new Date('2026-02-01T10:00:00Z'),
  );
  assert.equal(patch.assigned_at, firstAssignedAt);
  assert.equal(patch.assigned_to, 11);
});

test('a no-op reassignment is rejected rather than polluting the timeline', () => {
  assert.throws(
    () =>
      planTransition({
        complaint: complaint({ status: 'Assigned', assigned_to: 10 }),
        actor: handler,
        to: 'Assigned',
        payload: { assignedTo: 10 },
      }),
    /already assigned to that handler/,
  );
});

test('availableTransitions reflects the caller, not just the status', () => {
  const resolved = complaint({ status: 'Resolved', assigned_to: 10, resolved_at: new Date() });
  const state = getState('Resolved');

  const forStudent = state.availableTransitions(resolved, student).map((t) => t.to).sort();
  assert.deepEqual(forStudent, ['Closed', 'Investigating']);

  // The handler has no move left here: the complainant owns the verdict.
  assert.deepEqual(state.availableTransitions(resolved, handler), []);

  // A handler CAN reassign an assigned complaint — the probe must not confuse
  // "already assigned to this person" with "not permitted".
  const assigned = complaint({ status: 'Assigned', assigned_to: 10 });
  const labels = getState('Assigned').availableTransitions(assigned, handler).map((t) => t.to);
  assert.ok(labels.includes('Assigned'), 'reassignment should be offered');
  assert.ok(labels.includes('Investigating'));
  assert.ok(labels.includes('Resolved'));
});

test('every transition target is itself a known status (graph is closed)', () => {
  for (const status of COMPLAINT_STATUSES) {
    for (const target of getState(status).reachableStatuses) {
      assert.ok(isComplaintStatus(target), `${status} -> ${target} is not a known status`);
    }
  }
});
