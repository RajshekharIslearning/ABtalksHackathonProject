'use strict';
const axios = require('axios');

// We use the Gemini 2.0 Flash Lite free tier model on OpenRouter as our default
const DEFAULT_MODEL = 'google/gemini-2.0-flash-lite-preview-02-05:free';
const FALLBACK_MODEL = 'meta-llama/llama-3-8b-instruct:free';

/**
 * Calls OpenRouter's OpenAI-compatible chat completions API.
 * @param {string} prompt - The text prompt
 * @returns {Promise<string>} The generated response text
 */
async function callOpenRouterWithRetry(prompt) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey === 'your_openrouter_api_key_here') {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }

  const modelsToTry = [DEFAULT_MODEL, FALLBACK_MODEL];

  for (const model of modelsToTry) {
    try {
      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: model,
          messages: [{ role: 'user', content: prompt }]
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://github.com/RajshekharIslearning/ABtalksHackathonProject',
            'X-Title': 'Autonomous AI Persona'
          },
          timeout: 30000
        }
      );

      const content = response.data?.choices?.[0]?.message?.content;
      if (!content) throw new Error('Empty response from OpenRouter');
      
      return content;
    } catch (err) {
      const status = err.response?.status;
      if (status === 429 || status === 502 || status === 503) {
        console.warn(`[OpenRouter] Model "${model}" hit rate limit/busy (${status}), trying next fallback...`);
        continue;
      }
      throw err; // Non-retryable error
    }
  }

  throw new Error('All OpenRouter fallback models failed due to rate limits or busy servers.');
}

module.exports = { callOpenRouterWithRetry };
