'use strict';
const { fetchAllCandidates } = require('./newsFetcher');
const { judgeTopicsWithGemini } = require('./editorialJudge');

/**
 * Fuzzy-checks if a candidate title is too similar to existing topics.
 * Uses significant word overlap (4+ char words) as the similarity signal.
 * @param {string} title
 * @param {string[]} existingTopics
 * @returns {boolean} true if similar (duplicate)
 */
function isSimilarToExisting(title, existingTopics) {
  if (!existingTopics || existingTopics.length === 0) return false;

  const normalized = title.toLowerCase();
  const sigWords = normalized.split(/\W+/).filter(w => w.length > 4);

  return existingTopics.some(existing => {
    const existingWords = existing.toLowerCase().split(/\W+/).filter(w => w.length > 4);
    const matchCount = sigWords.filter(w => existingWords.includes(w)).length;
    // If 3+ significant words overlap, treat as a duplicate
    return matchCount >= 3;
  });
}

/**
 * Filters out candidates that have already been published or previously rejected.
 * @param {Array} candidates - Raw fetched candidates
 * @param {string[]} publishedTopics - Topic titles already published
 * @param {Array<{topic: string}>} rejectedTopics - Previously rejected topics
 * @returns {Array} Filtered candidate list
 */
function filterDuplicates(candidates, publishedTopics, rejectedTopics) {
  const rejectedTitles = rejectedTopics.map(r => r.topic);
  const allExisting = [...publishedTopics, ...rejectedTitles];

  const filtered = candidates.filter(c => {
    const isDup = isSimilarToExisting(c.title, allExisting);
    if (isDup) {
      console.log(`[TopicDiscovery] Filtered duplicate: "${c.title}"`);
    }
    return !isDup;
  });

  console.log(`[TopicDiscovery] After dedup: ${filtered.length} / ${candidates.length} candidates remain`);
  return filtered;
}

/**
 * Main entry point for Module B.
 *
 * Discovers live AI/tech topics, applies memory-aware deduplication,
 * and uses Gemini editorial judgment to approve or reject each topic.
 *
 * @param {string} agentId - The agent's unique ID
 * @param {object} persona - { name: string, domain: string }
 * @param {string[]} publishedTopics - Topic titles already published (from DB)
 * @param {Array<{topic: string, reason: string}>} rejectedTopics - Previously rejected
 * @returns {Promise<{ approved: TopicCandidate[], rejected: RejectedTopic[] }>}
 */
async function discoverAndJudgeTopics(agentId, persona, publishedTopics, rejectedTopics) {
  try {
    console.log(`[TopicDiscovery] Starting discovery for persona: "${persona.name}" (${persona.domain})`);

    // Step 1: Fetch live candidates from multiple sources
    const rawCandidates = await fetchAllCandidates(persona);

    if (rawCandidates.length === 0) {
      console.log('[TopicDiscovery] No candidates fetched — all sources empty or unreachable');
      return { approved: [], rejected: [] };
    }

    // Step 2: Filter out duplicates using memory (cheap, no LLM tokens)
    const freshCandidates = filterDuplicates(rawCandidates, publishedTopics, rejectedTopics);

    if (freshCandidates.length === 0) {
      console.log('[TopicDiscovery] All candidates are duplicates — nothing new to evaluate');
      return { approved: [], rejected: [] };
    }

    // Step 3: Limit to top 12 candidates before sending to LLM (cost control)
    const candidateBatch = freshCandidates.slice(0, 12);
    console.log(`[TopicDiscovery] Sending ${candidateBatch.length} candidates to editorial judge...`);

    // Step 4: Editorial judgment via Gemini
    const { approved, rejected } = await judgeTopicsWithGemini(
      candidateBatch,
      persona,
      publishedTopics
    );

    console.log(`[TopicDiscovery] Judgment complete: ${approved.length} approved, ${rejected.length} rejected`);

    // Sort approved by relevance score (descending)
    approved.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

    return { approved, rejected };

  } catch (err) {
    console.error('[TopicDiscovery] Fatal error:', err.message);
    // Return empty safely — the scheduler handles this gracefully
    return { approved: [], rejected: [] };
  }
}

module.exports = { discoverAndJudgeTopics };
