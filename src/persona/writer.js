'use strict';
/**
 * Module C — Persona Engine: Writer + Rationale Generator
 *
 * STUB FILE — To be implemented by Module C team member.
 *
 * The final implementation will:
 * 1. Take an approved topic from Module B
 * 2. Write an original, persona-consistent LinkedIn/X-style post using Gemini API
 * 3. Generate a structured rationale (why selected, why now, sources)
 * 4. Return a fully formed post object ready for DB storage
 *
 * Replace this stub with the full implementation.
 */

const { nanoid } = require('nanoid');

/**
 * Writes and returns a post for the given approved topic.
 *
 * @param {string} agentId - The agent's unique ID
 * @param {object} persona - { name: string, domain: string }
 * @param {object} topic - {
 *   title: string,
 *   summary: string,
 *   url: string,
 *   whySelected: string,
 *   whyNow: string,
 *   relevanceScore: number
 * }
 * @returns {Promise<{
 *   id: string,
 *   agentId: string,
 *   text: string,
 *   rationale: string,
 *   sources: string[],
 *   topic: string,
 *   createdAt: string
 * }|null>}
 */
async function writeAndPublishPost(agentId, persona, topic) {
  // TODO: Module C implements this with Gemini API

  // ─── STUB IMPLEMENTATION (for testing without Module C) ───
  // This generates a placeholder post so the API endpoints are testable.
  // Remove this when Module C is integrated.
  console.log('[Writer STUB] Generating placeholder post for topic:', topic.title);

  const stubPost = {
    id: `p_${nanoid(10)}`,
    agentId,
    text: `[STUB] As ${persona.name}, I find "${topic.title}" worth discussing in the context of ${persona.domain}. ${topic.summary}`,
    rationale: `SELECTED BECAUSE: ${topic.whySelected || 'Editorially relevant'} | TIMELY BECAUSE: ${topic.whyNow || 'Current topic'} | EDITORIAL FIT: Meets ${persona.name}'s standards for ${persona.domain} content`,
    sources: [topic.url],
    topic: topic.title,
    createdAt: new Date().toISOString()
  };

  return stubPost;
}

module.exports = { writeAndPublishPost };
