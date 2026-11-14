/**
 * ============================================================================
 * DESIGN PATTERN #2 — STRATEGY
 * ============================================================================
 * `classifyTicket()` is the Strategy *context*. It knows nothing about how a
 * complaint gets classified; it holds an ordered list of interchangeable
 * strategies and walks it until one succeeds.
 *
 *      anthropic  ──fails──▶  openai  ──fails──▶  keyword   (always succeeds)
 *
 * Every strategy implements the same interface, so the list is pure
 * configuration: reorder it, drop OpenAI, or add a self-hosted model, and no
 * caller changes. The keyword strategy is deliberately last and deliberately
 * infallible, which is what lets the rest of the application treat
 * classification as a total function — it never throws, so a provider outage
 * degrades routing quality instead of blocking complaint submission.
 *
 * Each attempt is bounded by AI_TIMEOUT_MS via an AbortController, so a hanging
 * provider costs one timeout rather than a hung request.
 * ============================================================================
 */
import { config } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { anthropicStrategy } from './strategies/anthropicStrategy.js';
import { openaiStrategy } from './strategies/openaiStrategy.js';
import { keywordStrategy, classifyWithKeywords } from './strategies/keywordStrategy.js';

/**
 * @typedef {Object} TicketInput
 * @property {string} title
 * @property {string} description
 */

/**
 * @typedef {Object} Classification
 * @property {string} category              A label from the taxonomy.
 * @property {string} departmentSlug        Routing target (`departments.slug`).
 * @property {import('./taxonomy.js').Priority} priority
 * @property {number} confidence            0..1.
 * @property {'anthropic' | 'openai' | 'keyword'} strategy  Which one answered.
 * @property {string} reasoning
 */

/**
 * The contract every strategy honours.
 *
 * @typedef {Object} ClassificationStrategy
 * @property {Classification['strategy']} name
 * @property {() => boolean} isAvailable
 *           Cheap, synchronous check — usually "is the API key configured".
 * @property {(input: TicketInput, signal: AbortSignal) => Promise<Classification>} classify
 *           Resolves with a validated classification, or throws to hand over to
 *           the next strategy.
 */

/**
 * @typedef {Object} StrategyAttempt
 * @property {string} strategy
 * @property {'ok' | 'skipped' | 'failed' | 'timeout'} outcome
 * @property {number} [elapsedMs]
 * @property {string} [error]
 */

/**
 * @typedef {Classification & {
 *   attempts: StrategyAttempt[],
 *   degraded: boolean
 * }} ClassificationResult
 */

/**
 * Priority order. First entry wins whenever it is available and succeeds.
 * @type {ReadonlyArray<ClassificationStrategy>}
 */
export const DEFAULT_STRATEGY_CHAIN = Object.freeze([
  anthropicStrategy,
  openaiStrategy,
  keywordStrategy,
]);

/**
 * Classifies a complaint into a department, category and priority.
 *
 * Never throws: the chain always terminates in the rule-based engine.
 *
 * @param {TicketInput} input
 * @param {{ chain?: ReadonlyArray<ClassificationStrategy> }} [options]
 *        Injection point for tests — pass a stub chain to exercise fallback.
 * @returns {Promise<ClassificationResult>}
 */
export async function classifyTicket(input, options = {}) {
  const chain = options.chain ?? DEFAULT_STRATEGY_CHAIN;
  /** @type {StrategyAttempt[]} */
  const attempts = [];

  for (const strategy of chain) {
    const isLlm = strategy.name !== 'keyword';

    // AI_ENABLED=false pins the system to deterministic rules — used in CI and
    // whenever an institution wants classification to be auditable.
    if (isLlm && !config.ai.enabled) {
      attempts.push({ strategy: strategy.name, outcome: 'skipped', error: 'AI_ENABLED=false' });
      continue;
    }
    if (!strategy.isAvailable()) {
      attempts.push({ strategy: strategy.name, outcome: 'skipped', error: 'not configured' });
      continue;
    }

    const controller = new AbortController();
    const timer = isLlm
      ? setTimeout(() => controller.abort(new Error('classification timed out')), config.ai.timeoutMs)
      : null;
    const startedAt = Date.now();

    try {
      const result = await strategy.classify(input, controller.signal);
      const elapsedMs = Date.now() - startedAt;
      attempts.push({ strategy: strategy.name, outcome: 'ok', elapsedMs });

      // "Degraded" means an LLM was configured and tried, but the answer came
      // from the rule engine. Surfaced to admins so silent AI outages are
      // visible rather than merely inferred from worse routing.
      const degraded =
        strategy.name === 'keyword' && attempts.some((a) => a.outcome === 'failed' || a.outcome === 'timeout');

      if (degraded) {
        logger.warn('Classification fell back to the keyword engine', { attempts });
      }
      return { ...result, attempts, degraded };
    } catch (error) {
      const elapsedMs = Date.now() - startedAt;
      const timedOut = controller.signal.aborted;
      attempts.push({
        strategy: strategy.name,
        outcome: timedOut ? 'timeout' : 'failed',
        elapsedMs,
        error: error instanceof Error ? error.message : String(error),
      });
      logger.warn(`Classification strategy "${strategy.name}" failed; trying the next one`, {
        error: error instanceof Error ? error.message : String(error),
        timedOut,
      });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // Only reachable if someone supplies a custom chain without the keyword
  // strategy. Route to general administration rather than reject the complaint:
  // losing a grievance is a far worse failure than misrouting one.
  logger.error('Every classification strategy failed; using the rule engine directly', { attempts });
  return { ...classifyWithKeywords(input), attempts, degraded: true };
}

export { classifyWithKeywords };
