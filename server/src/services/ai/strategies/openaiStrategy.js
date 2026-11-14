/**
 * STRATEGY — OpenAI chat completions, over plain HTTP.
 *
 * The middle link in the chain: used when Anthropic is unconfigured or failing.
 * Called with `fetch` rather than the `openai` package on purpose — this is a
 * single JSON request, and the project should not carry a second vendor SDK for
 * it. (The Claude call above does use the official Anthropic SDK.)
 *
 * `OPENAI_BASE_URL` makes this work unchanged against any OpenAI-compatible
 * endpoint (Azure OpenAI, a local vLLM/Ollama gateway, an internal proxy).
 */
import { config } from '../../../config/env.js';
import { CLASSIFICATION_SCHEMA, SYSTEM_PROMPT, buildUserPrompt } from '../prompt.js';
import { parseClassification } from '../parse.js';

/** @typedef {import('../index.js').ClassificationStrategy} ClassificationStrategy */

/** @type {ClassificationStrategy} */
export const openaiStrategy = {
  name: 'openai',

  isAvailable: () => Boolean(config.ai.openaiApiKey),

  async classify(input, signal) {
    const response = await fetch(`${config.ai.openaiBaseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.ai.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: config.ai.openaiModel,
        // Routing must be reproducible: the same complaint always lands in the
        // same queue.
        temperature: 0,
        max_tokens: 400,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'ticket_classification',
            strict: true,
            schema: CLASSIFICATION_SCHEMA,
          },
        },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(input) },
        ],
      }),
    });

    if (!response.ok) {
      // Read a bounded slice of the body: provider errors can be verbose and
      // this string ends up in a log line.
      const detail = (await response.text().catch(() => '')).slice(0, 300);
      throw new Error(`OpenAI request failed with ${response.status}: ${detail}`);
    }

    const body = /** @type {{ choices?: Array<{ message?: { content?: string }, finish_reason?: string }> }} */ (
      await response.json()
    );
    const choice = body.choices?.[0];
    if (choice?.finish_reason === 'content_filter') {
      throw new Error('OpenAI content filter declined the classification request');
    }
    const text = choice?.message?.content?.trim();
    if (!text) throw new Error('Empty response from OpenAI');

    return parseClassification(text, 'openai', input);
  },
};
