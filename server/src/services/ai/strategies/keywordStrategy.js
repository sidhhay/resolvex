/**
 * STRATEGY — rule-based keyword / regex engine.
 *
 * The guaranteed-available strategy and the last link in the chain. It never
 * throws and never needs the network, which is precisely what makes the
 * classifier safe to depend on: if every LLM provider is down, misconfigured or
 * rate-limited, complaints still get routed to a department instead of piling
 * up unclassified.
 *
 * Scoring
 * -------
 *   • a plain keyword hit scores 1, a `strongSignal` regex hit scores 3;
 *   • hits in the title count double — a title is a deliberate summary, whereas
 *     a long description mentions many incidental nouns;
 *   • confidence reflects how decisively the winner beat the runner-up, so an
 *     ambiguous "the hostel wifi is broken" reports low confidence honestly
 *     rather than pretending to be sure.
 */
import {
  CATEGORIES,
  FALLBACK_CATEGORY,
  inferPriority,
  maxPriority,
} from '../taxonomy.js';

/** @typedef {import('../index.js').TicketInput} TicketInput */
/** @typedef {import('../index.js').Classification} Classification */
/** @typedef {import('../taxonomy.js').CategoryDefinition} CategoryDefinition */

/**
 * Compiled matchers are cached: the regex set is fixed at module load, so
 * rebuilding them per complaint would be pure waste.
 * @type {Map<string, RegExp>}
 */
const matcherCache = new Map();

/**
 * Word-boundary matcher for a keyword or multi-word phrase. Whitespace in the
 * phrase matches any run of whitespace so "drinking  water" still hits.
 * @param {string} keyword
 * @returns {RegExp}
 */
function matcherFor(keyword) {
  let matcher = matcherCache.get(keyword);
  if (!matcher) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    // \b fails against a leading/trailing non-word char (e.g. "wi-fi"), so the
    // boundary is expressed as "not preceded/followed by a word character".
    matcher = new RegExp(`(?<![\\w])${escaped}(?![\\w])`, 'i');
    matcherCache.set(keyword, matcher);
  }
  return matcher;
}

/**
 * @param {CategoryDefinition} category
 * @param {string} text
 * @returns {number}
 */
function scoreText(category, text) {
  if (!text) return 0;
  let score = 0;
  for (const keyword of category.keywords) {
    if (matcherFor(keyword).test(text)) score += 1;
  }
  for (const pattern of category.strongSignals ?? []) {
    if (pattern.test(text)) score += 3;
  }
  return score;
}

/**
 * Runs the rule engine. Exported separately from the strategy object so the
 * unit tests (and the LLM strategies, as a sanity cross-check) can call it
 * directly.
 *
 * @param {TicketInput} input
 * @returns {Classification}
 */
export function classifyWithKeywords(input) {
  const title = (input.title ?? '').trim();
  const description = (input.description ?? '').trim();
  const combined = `${title}\n${description}`;

  /** @type {Array<{ category: CategoryDefinition, score: number }>} */
  const scored = CATEGORIES.map((category) => ({
    category,
    // Title hits count double.
    score: scoreText(category, title) * 2 + scoreText(category, description),
  })).sort((a, b) => b.score - a.score);

  const best = scored[0];
  const runnerUp = scored[1];

  if (!best || best.score === 0) {
    // Nothing matched at all. Route to general administration and say so with a
    // low confidence, which lets a handler triage manually.
    return {
      category: FALLBACK_CATEGORY.label,
      departmentSlug: FALLBACK_CATEGORY.departmentSlug,
      priority: inferPriority(combined, 'medium'),
      confidence: 0.2,
      strategy: 'keyword',
      reasoning: 'No categorising keyword matched; routed to general administration for manual triage.',
    };
  }

  // Margin over the runner-up, in [0, 1]. A clean win gives ~0.9; a near tie
  // between two departments gives ~0.45.
  const margin = (best.score - (runnerUp?.score ?? 0)) / best.score;
  const confidence = Math.min(0.92, Math.max(0.4, 0.45 + margin * 0.45));

  const basePriority = best.category.basePriority ?? 'medium';
  return {
    category: best.category.label,
    departmentSlug: best.category.departmentSlug,
    priority: maxPriority(basePriority, inferPriority(combined, 'medium')),
    confidence: Number(confidence.toFixed(3)),
    strategy: 'keyword',
    reasoning:
      runnerUp && runnerUp.score > 0
        ? `Keyword score ${best.score} for ${best.category.label} (next best: ${runnerUp.category.label} at ${runnerUp.score}).`
        : `Keyword score ${best.score} for ${best.category.label}.`,
  };
}

/** @type {import('../index.js').ClassificationStrategy} */
export const keywordStrategy = {
  name: 'keyword',
  /** Always available — that is the whole point of this strategy. */
  isAvailable: () => true,
  classify: async (input) => classifyWithKeywords(input),
};
