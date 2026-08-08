'use strict';
const { fetchAllCandidates } = require('./newsFetcher');
const { judgeTopicsWithGemini } = require('./editorialJudge');
const {
  createBreethClient,
  checkSemanticDuplicate,
  recordPublishedPost,
  recordRejectedTopic,
  recordPersonaInit
} = require('./breethMemory');

// Cache the Breeth client per agent (created once, reused)
const breethClients = new Map();

/**
 * Gets (or creates) a Breeth client for an agent.
 * Returns null if BREETH_API_KEY is not configured — falls back to SQLite-only.
 * @param {string} agentId
 * @returns {object|null}
 */
function getBreethClient(agentId) {
  if (!breethClients.has(agentId)) {
    const client = createBreethClient();
    breethClients.set(agentId, client);
    if (client) {
      console.log(`[TopicDiscovery] Breeth memory enabled for agent "${agentId}"`);
    } else {
      console.log(`[TopicDiscovery] Breeth not configured — using SQLite memory only for agent "${agentId}"`);
    }
  }
  return breethClients.get(agentId);
}

/**
 * Keyword-based fuzzy duplicate check against SQLite memory (fast, no API cost).
 * Used as a first-pass filter before semantic search.
 * @param {string} title
 * @param {string[]} existingTopics
 * @returns {boolean} true if duplicate
 */
function isFuzzyDuplicate(title, existingTopics) {
  if (!existingTopics || existingTopics.length === 0) return false;

  const normalized = title.toLowerCase();
  const sigWords = normalized.split(/\W+/).filter(w => w.length > 4);

  return existingTopics.some(existing => {
    const existingWords = existing.toLowerCase().split(/\W+/).filter(w => w.length > 4);
    const matchCount = sigWords.filter(w => existingWords.includes(w)).length;
    return matchCount >= 3;
  });
}

/**
 * Two-pass deduplication:
 *   Pass 1: Fast keyword/fuzzy match against SQLite memory (no API cost)
 *   Pass 2: Semantic similarity check via Breeth (catches paraphrased duplicates)
 *
 * @param {Array} candidates - Raw fetched candidates
 * @param {string[]} publishedTopics - Topic titles already published (from SQLite)
 * @param {Array<{topic: string}>} rejectedTopics - Previously rejected (from SQLite)
 * @param {object|null} breethClient - Breeth API client (or null)
 * @param {string} agentId - For scoping Breeth memory search
 * @returns {Promise<Array>} Filtered candidate list
 */
async function deduplicateCandidates(candidates, publishedTopics, rejectedTopics, breethClient, agentId) {
  const rejectedTitles = rejectedTopics.map(r => r.topic);
  const allSQLiteTopics = [...publishedTopics, ...rejectedTitles];

  const passOneFiltered = [];
  let fuzzyDropCount = 0;

  // Pass 1: Fast SQLite fuzzy match
  for (const c of candidates) {
    if (isFuzzyDuplicate(c.title, allSQLiteTopics)) {
      fuzzyDropCount++;
      console.log(`[TopicDiscovery] [Pass 1 - Fuzzy] Dropped: "${c.title}"`);
    } else {
      passOneFiltered.push(c);
    }
  }

  console.log(`[TopicDiscovery] Pass 1 (fuzzy): ${fuzzyDropCount} dropped, ${passOneFiltered.length} remain`);

  // Pass 2: Semantic dedup via Breeth (only if Breeth is available + there are candidates)
  if (!breethClient || passOneFiltered.length === 0) {
    return passOneFiltered;
  }

  const semanticallyFresh = [];
  let semanticDropCount = 0;

  for (const c of passOneFiltered) {
    const { isDuplicate, reason } = await checkSemanticDuplicate(
      breethClient,
      c.title,
      agentId,
      0.85 // 85% similarity threshold
    );

    if (isDuplicate) {
      semanticDropCount++;
      console.log(`[TopicDiscovery] [Pass 2 - Semantic] Dropped: "${c.title}" — ${reason}`);
    } else {
      semanticallyFresh.push(c);
    }
  }

  console.log(`[TopicDiscovery] Pass 2 (semantic): ${semanticDropCount} dropped, ${semanticallyFresh.length} remain`);
  return semanticallyFresh;
}

/**
 * Persists approved and rejected decisions to both SQLite (via caller) and Breeth memory.
 * Called by the scheduler after it has saved to SQLite.
 *
 * @param {object|null} breethClient
 * @param {string} personaName
 * @param {object} approvedTopic - The topic that was published
 * @param {object} publishedPost - The post that was written
 * @param {Array<{topic: string, reason: string}>} rejectedList
 * @param {string} agentId
 */
async function persistDecisionsToBreeth(breethClient, personaName, approvedTopic, publishedPost, rejectedList, agentId) {
  if (!breethClient) return;

  const tasks = [];

  // Record the published post to Breeth
  if (approvedTopic && publishedPost) {
    tasks.push(recordPublishedPost(breethClient, personaName, publishedPost, approvedTopic, agentId));
  }

  // Record all rejected topics to Breeth
  for (const r of rejectedList) {
    tasks.push(recordRejectedTopic(breethClient, personaName, r.topic, r.reason, agentId));
  }

  // Run in parallel, don't block the scheduler
  await Promise.allSettled(tasks);
}

/**
 * Main entry point for Module B.
 *
 * Discovers live AI/tech topics, applies two-pass memory-aware deduplication
 * (SQLite fuzzy + Breeth semantic), and uses Gemini editorial judgment.
 *
 * @param {string} agentId - The agent's unique ID
 * @param {object} persona - { name: string, domain: string }
 * @param {string[]} publishedTopics - Topic titles already published (from SQLite DB)
 * @param {Array<{topic: string, reason: string}>} rejectedTopics - Previously rejected (from SQLite)
 * @returns {Promise<{ approved: TopicCandidate[], rejected: RejectedTopic[] }>}
 */
async function discoverAndJudgeTopics(agentId, persona, publishedTopics, rejectedTopics) {
  try {
    console.log(`[TopicDiscovery] 🔍 Starting cycle — persona: "${persona.name}" (${persona.domain})`);

    const breethClient = getBreethClient(agentId);

    // Step 1: Fetch live candidates from multiple sources in parallel
    const rawCandidates = await fetchAllCandidates(persona);

    if (rawCandidates.length === 0) {
      console.log('[TopicDiscovery] No candidates fetched — all sources unreachable');
      return { approved: [], rejected: [] };
    }

    console.log(`[TopicDiscovery] Fetched ${rawCandidates.length} raw candidates`);

    // Step 2: Two-pass deduplication (SQLite fuzzy → Breeth semantic)
    const freshCandidates = await deduplicateCandidates(
      rawCandidates,
      publishedTopics,
      rejectedTopics,
      breethClient,
      agentId
    );

    if (freshCandidates.length === 0) {
      console.log('[TopicDiscovery] All candidates are duplicates — nothing new to evaluate');
      return { approved: [], rejected: [] };
    }

    // Step 3: Limit batch before sending to Gemini (cost control)
    const candidateBatch = freshCandidates.slice(0, 12);
    console.log(`[TopicDiscovery] Sending ${candidateBatch.length} candidates to Gemini editorial judge...`);

    // Step 4: Editorial judgment via Gemini
    const { approved, rejected } = await judgeTopicsWithGemini(
      candidateBatch,
      persona,
      publishedTopics
    );

    console.log(`[TopicDiscovery] ✅ Judgment: ${approved.length} approved, ${rejected.length} rejected`);

    // Sort approved by relevance score (descending)
    approved.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

    return { approved, rejected };

  } catch (err) {
    console.error('[TopicDiscovery] Fatal error:', err.message);
    return { approved: [], rejected: [] };
  }
}

module.exports = { discoverAndJudgeTopics, persistDecisionsToBreeth, getBreethClient };
