/**
 * Validation of an LLM classification response.
 *
 * Shared by every LLM strategy so that a model answer is subjected to exactly
 * the same scrutiny regardless of vendor. Anything that fails validation throws,
 * which drops the request down to the next strategy in the chain.
 */
import { config } from '../../config/env.js';
import {
  PRIORITIES,
  findCategoryByLabel,
  inferPriority,
  maxPriority,
} from './taxonomy.js';

/** @typedef {import('./index.js').Classification} Classification */
/** @typedef {import('./index.js').TicketInput} TicketInput */

/**
 * Structured outputs should make this unnecessary, but a model behind a proxy
 * or an older endpoint can still wrap JSON in a markdown fence.
 * @param {string} text
 * @returns {string}
 */
function stripCodeFence(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return (fenced?.[1] ?? text).trim();
}

/**
 * @param {string} text        Raw model output.
 * @param {Classification['strategy']} strategy
 * @param {TicketInput} input
 * @returns {Classification}
 */
export function parseClassification(text, strategy, input) {
  /** @type {Record<string, unknown>} */
  let raw;
  try {
    raw = JSON.parse(stripCodeFence(text));
  } catch {
    throw new Error(`${strategy} returned output that is not valid JSON`);
  }

  // The category is a routing decision: it must be one of ours, never free text.
  const category = findCategoryByLabel(String(raw.category ?? ''));
  if (!category) {
    throw new Error(`${strategy} returned unknown category "${String(raw.category)}"`);
  }

  const confidence = Number(raw.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error(`${strategy} returned a non-numeric confidence`);
  }
  if (confidence < config.ai.minConfidence) {
    // The model told us it is guessing. Deterministic rules are a better answer
    // than a low-confidence guess, so fail over rather than accept this.
    throw new Error(
      `${strategy} confidence ${confidence.toFixed(2)} is below the ${config.ai.minConfidence} floor`,
    );
  }

  const claimed = String(raw.priority ?? '');
  const priority = /** @type {import('./taxonomy.js').Priority} */ (
    PRIORITIES.includes(/** @type {any} */ (claimed)) ? claimed : 'medium'
  );

  return {
    category: category.label,
    departmentSlug: category.departmentSlug,
    // Two policy floors are applied on top of the model's judgement:
    //   1. the category's own floor (a discipline case is always urgent),
    //   2. rule-based red flags in the text ("fire", "gas leak", "emergency").
    // Both can only raise the priority, never lower what the model chose.
    priority: maxPriority(
      maxPriority(priority, category.basePriority ?? 'low'),
      inferPriority(`${input.title ?? ''}\n${input.description ?? ''}`, 'low'),
    ),
    confidence: Number(confidence.toFixed(3)),
    strategy,
    reasoning: String(raw.reasoning ?? '').slice(0, 300),
  };
}
