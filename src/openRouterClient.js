'use strict';
const axios = require('axios');

// Use the OpenRouter auto-routed free models
const DEFAULT_MODEL = 'openrouter/free';

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
    try {
      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: DEFAULT_MODEL,
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
        console.warn(`[OpenRouter] "openrouter/free" hit rate limit/busy (${status}).`);
      }
      throw err;
    }
}

module.exports = { callOpenRouterWithRetry };
