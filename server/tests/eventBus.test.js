/**
 * Observer pattern — fan-out, failure isolation and blocking semantics.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { NotificationBroker } from '../src/events/eventBus.js';
import { EVENTS, describeEvent, emailSubject } from '../src/events/events.js';

/** @returns {import('../src/events/events.js').ComplaintEventPayload} */
function payload() {
  return /** @type {any} */ ({
    complaint: {
      id: 7,
      title: 'Wi-Fi keeps dropping in Block C',
      status: 'Assigned',
      department_name: 'IT & Network Services',
      assignee_name: 'Imran Sheikh',
    },
    actor: { id: 3, name: 'Imran Sheikh', role: 'handler' },
    fromStatus: 'Submitted',
    toStatus: 'Assigned',
    audience: { userIds: [1, 2], emails: ['a@b.c'], rooms: ['user:1'] },
  });
}

test('publish fans out to every observer registered for the event', async () => {
  const bus = new NotificationBroker();
  /** @type {string[]} */
  const seen = [];

  bus.subscribe(EVENTS.COMPLAINT_ASSIGNED, {
    name: 'one',
    blocking: true,
    handle: () => void seen.push('one'),
  });
  bus.subscribe([EVENTS.COMPLAINT_ASSIGNED, EVENTS.COMPLAINT_CLOSED], {
    name: 'two',
    blocking: true,
    handle: () => void seen.push('two'),
  });

  await bus.publish(EVENTS.COMPLAINT_ASSIGNED, payload());
  assert.deepEqual(seen.sort(), ['one', 'two']);

  await bus.publish(EVENTS.COMPLAINT_CLOSED, payload());
  assert.deepEqual(seen.sort(), ['one', 'two', 'two']);
});

test('an observer that throws cannot break the transition or its siblings', async () => {
  const bus = new NotificationBroker();
  let siblingRan = false;

  bus.subscribe(EVENTS.COMPLAINT_ESCALATED, {
    name: 'broken-smtp',
    blocking: true,
    handle: () => {
      throw new Error('SMTP connection refused');
    },
  });
  bus.subscribe(EVENTS.COMPLAINT_ESCALATED, {
    name: 'healthy',
    blocking: true,
    handle: () => {
      siblingRan = true;
    },
  });

  // The domain operation has already committed by this point; publish must
  // resolve regardless of what the notification layer does.
  await assert.doesNotReject(() => bus.publish(EVENTS.COMPLAINT_ESCALATED, payload()));
  assert.equal(siblingRan, true);
});

test('publish awaits blocking observers but not fire-and-forget ones', async () => {
  const bus = new NotificationBroker();
  let blockingDone = false;
  let asyncDone = false;

  bus.subscribe(EVENTS.COMPLAINT_CREATED, {
    name: 'persistence',
    blocking: true,
    handle: async () => {
      await new Promise((r) => setTimeout(r, 10));
      blockingDone = true;
    },
  });
  bus.subscribe(EVENTS.COMPLAINT_CREATED, {
    name: 'email',
    blocking: false,
    handle: async () => {
      await new Promise((r) => setTimeout(r, 60));
      asyncDone = true;
    },
  });

  await bus.publish(EVENTS.COMPLAINT_CREATED, payload());
  assert.equal(blockingDone, true, 'the stored notification must exist before we return');
  assert.equal(asyncDone, false, 'e-mail must not hold up the API response');
});

test('publishing an event nobody listens to is a no-op', async () => {
  const bus = new NotificationBroker();
  await assert.doesNotReject(() => bus.publish('nobody.listening', payload()));
});

test('unsubscribe detaches an observer', async () => {
  const bus = new NotificationBroker();
  let calls = 0;
  const unsubscribe = bus.subscribe(EVENTS.COMPLAINT_CLOSED, {
    name: 'temp',
    blocking: true,
    handle: () => {
      calls += 1;
    },
  });

  await bus.publish(EVENTS.COMPLAINT_CLOSED, payload());
  unsubscribe();
  await bus.publish(EVENTS.COMPLAINT_CLOSED, payload());
  assert.equal(calls, 1);
  assert.deepEqual(bus.listenersFor(EVENTS.COMPLAINT_CLOSED), []);
});

test('one wording is shared by the toast, the stored row and the e-mail', () => {
  const data = payload();

  assert.match(describeEvent(EVENTS.COMPLAINT_ASSIGNED, data), /assigned to Imran Sheikh/);
  assert.match(describeEvent(EVENTS.COMPLAINT_CREATED, data), /routed to IT & Network Services/);
  assert.match(
    describeEvent(EVENTS.COMPLAINT_ESCALATED, { ...data, escalationLevel: 2 }),
    /Dean \/ Director/,
  );
  assert.match(describeEvent(EVENTS.COMPLAINT_STATUS_CHANGED, data), /from Submitted to Assigned/);
  assert.equal(emailSubject(EVENTS.COMPLAINT_ESCALATED, data), '[ResolveX #7] ESCALATED — SLA breached');
});

test('long titles are truncated so a notification stays one line', () => {
  const data = payload();
  data.complaint.title = 'x'.repeat(200);
  const message = describeEvent(EVENTS.COMPLAINT_CREATED, data);
  assert.ok(message.includes('…'));
  assert.ok(message.length < 160);
});
