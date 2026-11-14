/**
 * Strategy pattern — routing accuracy and, more importantly, what happens when
 * the LLM providers fail.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyTicket, classifyWithKeywords } from '../src/services/ai/index.js';
import { CATEGORY_LABELS, inferPriority, maxPriority } from '../src/services/ai/taxonomy.js';

test('the rule engine routes representative complaints to the right department', () => {
  /** @type {Array<[string, string, string]>} */
  const cases = [
    ['Wi-Fi keeps dropping in Block C', 'The wifi disconnects every evening and I cannot reach the student portal to submit work.', 'IT & Network Services'],
    ['No drinking water on hostel floor 3', 'The RO water purifier in the boys hostel has been broken for a week and the warden has not responded.', 'Hostel & Residence'],
    ['Internal marks missing for CS301', 'My internal assessment marks are not on the portal so I cannot confirm examination eligibility.', 'Examination & Evaluation'],
    ['Washrooms are filthy', 'The toilets near the lecture hall have not been cleaned, bins are overflowing and there is standing water.', 'Sanitation & Housekeeping'],
    ['Lift stuck between floors', 'The elevator in the academic block is out of order and the wiring sparks when the door closes.', 'Infrastructure & Maintenance'],
    ['Scholarship not credited', 'My scholarship payment has not been disbursed and the fee receipt still shows dues outstanding.', 'Accounts & Finance'],
    ['Bus route timing changed without notice', 'The shuttle bus driver changed the pickup stop and students are missing the commute.', 'Transport'],
  ];

  for (const [title, description, expected] of cases) {
    const result = classifyWithKeywords({ title, description });
    assert.equal(result.category, expected, `"${title}" routed to ${result.category}`);
    assert.ok(CATEGORY_LABELS.includes(result.category));
    assert.ok(result.confidence > 0 && result.confidence <= 1);
  }
});

test('harassment reports are routed to discipline at urgent priority', () => {
  const result = classifyWithKeywords({
    title: 'Ragging by senior students in the hostel',
    description: 'A group of seniors threatened me and other first years in the hostel corridor last night.',
  });
  assert.equal(result.category, 'Discipline & Anti-Harassment');
  assert.equal(result.priority, 'urgent');
});

test('an unclassifiable complaint lands in general administration with low confidence', () => {
  const result = classifyWithKeywords({
    title: 'A question about something',
    description: 'I would like to raise a point that nobody has been able to answer for me so far.',
  });
  assert.equal(result.category, 'General Administration');
  assert.ok(result.confidence < 0.35, `expected low confidence, got ${result.confidence}`);
});

test('priority signals escalate but "minor" never demotes an urgent complaint', () => {
  assert.equal(inferPriority('there is a fire in the chemistry lab'), 'urgent');
  assert.equal(inferPriority('a minor suggestion about the notice board'), 'low');
  // Both signals present: urgency wins.
  assert.equal(inferPriority('a minor gas leak, please treat as urgent'), 'urgent');
  assert.equal(maxPriority('low', 'high'), 'high');
});

test('confidence is higher for a decisive match than an ambiguous one', () => {
  const decisive = classifyWithKeywords({
    title: 'Library reading room closes early',
    description: 'The library reading room and its book stacks close before the notified time during examinations.',
  });
  const ambiguous = classifyWithKeywords({
    title: 'Problem in the hostel',
    description: 'There is an issue with the wifi router in the hostel mess that nobody has looked at yet.',
  });
  assert.ok(
    decisive.confidence > ambiguous.confidence,
    `decisive ${decisive.confidence} should beat ambiguous ${ambiguous.confidence}`,
  );
});

/* -------------------------------------------------------------------------- */
/* The point of the Strategy pattern: graceful degradation.                    */
/* -------------------------------------------------------------------------- */

/**
 * @param {string} name
 * @param {Error} error
 * @returns {import('../src/services/ai/index.js').ClassificationStrategy}
 */
const failingStrategy = (name, error) => ({
  name: /** @type {any} */ (name),
  isAvailable: () => true,
  classify: async () => {
    throw error;
  },
});

test('a failing LLM strategy falls through to the keyword engine', async () => {
  const { keywordStrategy } = await import('../src/services/ai/strategies/keywordStrategy.js');

  const result = await classifyTicket(
    { title: 'Wi-Fi down in Block C', description: 'The internet has not worked in the hostel block all week.' },
    { chain: [failingStrategy('anthropic', new Error('503 upstream')), keywordStrategy] },
  );

  assert.equal(result.strategy, 'keyword');
  assert.equal(result.category, 'IT & Network Services');
  assert.equal(result.degraded, true, 'a fallback after a failure must be reported as degraded');
  assert.equal(result.attempts[0].outcome, 'failed');
  assert.match(String(result.attempts[0].error), /503 upstream/);
});

test('the chain tries each provider in order before giving up on LLMs', async () => {
  const { keywordStrategy } = await import('../src/services/ai/strategies/keywordStrategy.js');

  const result = await classifyTicket(
    { title: 'Broken chair in lab', description: 'The furniture in the computer lab is damaged and needs repair urgently.' },
    {
      chain: [
        failingStrategy('anthropic', new Error('rate limited')),
        failingStrategy('openai', new Error('invalid api key')),
        keywordStrategy,
      ],
    },
  );

  assert.deepEqual(
    result.attempts.map((a) => `${a.strategy}:${a.outcome}`),
    ['anthropic:failed', 'openai:failed', 'keyword:ok'],
  );
  assert.equal(result.degraded, true);
});

test('a successful LLM answer is not marked degraded', async () => {
  /** @type {import('../src/services/ai/index.js').ClassificationStrategy} */
  const goodStrategy = {
    name: 'anthropic',
    isAvailable: () => true,
    classify: async () => ({
      category: 'Library',
      departmentSlug: 'library',
      priority: 'low',
      confidence: 0.91,
      strategy: 'anthropic',
      reasoning: 'Mentions the reading room.',
    }),
  };

  const result = await classifyTicket(
    { title: 'Reading room hours', description: 'The reading room is closing earlier than the notified time.' },
    { chain: [goodStrategy] },
  );

  assert.equal(result.strategy, 'anthropic');
  assert.equal(result.degraded, false);
  assert.equal(result.attempts[0].outcome, 'ok');
});

test('classifyTicket never throws, even when every strategy is broken', async () => {
  const result = await classifyTicket(
    { title: 'Something is wrong', description: 'The hostel mess food quality has dropped sharply this month.' },
    { chain: [failingStrategy('anthropic', new Error('boom'))] },
  );
  // Losing a grievance is worse than misrouting one, so the rule engine is
  // used directly rather than propagating the failure to the complainant.
  assert.equal(result.strategy, 'keyword');
  assert.equal(result.degraded, true);
});

test('an unavailable strategy is skipped without being attempted', async () => {
  const { keywordStrategy } = await import('../src/services/ai/strategies/keywordStrategy.js');
  let attempted = false;

  const result = await classifyTicket(
    { title: 'Bus stop moved', description: 'The transport department changed the bus route without informing students.' },
    {
      chain: [
        {
          name: /** @type {any} */ ('openai'),
          isAvailable: () => false,
          classify: async () => {
            attempted = true;
            throw new Error('should never run');
          },
        },
        keywordStrategy,
      ],
    },
  );

  assert.equal(attempted, false);
  assert.equal(result.attempts[0].outcome, 'skipped');
  // Skipping an unconfigured provider is normal operation, not degradation.
  assert.equal(result.degraded, false);
});
