/**
 * STRATEGY — Anthropic Claude via the official SDK.
 *
 * The preferred strategy: it understands intent rather than vocabulary, so
 * "the lift has been stuck between floors since Tuesday" routes to
 * Infrastructure even though no keyword in the taxonomy appears verbatim.
 *
 * Every failure mode below is deliberately expressed as a thrown error, because
 * a throw is what hands control to the next strategy in the chain:
 *   • missing API key                → not available, never attempted
 *   • timeout / network / 5xx / 429  → throw, fall through to OpenAI or keywords
 *   • stop_reason "refusal"          → throw; the keyword engine has explicit
 *                                      rules for harassment reports, so the
 *                                      deterministic fallback handles exactly
 *                                      the content a classifier may decline
 *   • category outside the taxonomy  → throw, never trust free-text routing
 *   • confidence below the floor     → throw, prefer deterministic rules to a
 *                                      guess the model itself doubts
 */
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../../../config/env.js';
import { logger } from '../../../config/logger.js';
import { CLASSIFICATION_SCHEMA, SYSTEM_PROMPT, buildUserPrompt } from '../prompt.js';
import { parseClassification } from '../parse.js';

/** @typedef {import('../index.js').ClassificationStrategy} ClassificationStrategy */

/** @type {Anthropic | null} */
let client = null;

/** Lazily constructed so an unset key never throws at import time. */
function getClient() {
  if (!client) {
    client = new Anthropic({
      apiKey: config.ai.anthropicApiKey,
      // The chain already provides resilience; a long internal retry ladder
      // would just delay the fallback the caller is waiting for.
      maxRetries: 1,
    });
  }
  return client;
}

/** @type {ClassificationStrategy} */
export const anthropicStrategy = {
  name: 'anthropic',

  isAvailable: () => Boolean(config.ai.anthropicApiKey),

  async classify(input, signal) {
    const response = await getClient().messages.create(
      {
        model: config.ai.anthropicModel,
        // Adaptive thinking is on by default on this model family; the budget
        // has to cover it as well as the small JSON payload.
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserPrompt(input) }],
        output_config: {
          // Routing is a simple call — low effort keeps latency and cost down
          // without measurably hurting accuracy on this task.
          effort: 'low',
          format: { type: 'json_schema', schema: CLASSIFICATION_SCHEMA },
        },
      },
      { signal, timeout: config.ai.timeoutMs },
    );

    if (response.stop_reason === 'refusal') {
      logger.warn('Anthropic declined to classify a complaint; falling back', {
        category: response.stop_details?.category ?? null,
      });
      throw new Error('Model declined the classification request');
    }

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();

    if (!text) throw new Error('Empty response from Anthropic');

    return parseClassification(text, 'anthropic', input);
  },
};
