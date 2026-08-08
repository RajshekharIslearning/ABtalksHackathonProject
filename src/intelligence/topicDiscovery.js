'use strict';
const { fetchAllCandidates } = require('./newsFetcher');
const { judgeTopicsWithGemini } = require('./editorialJudge');
const {
  createBreethClient,
  checkSemanticDuplicate,
  recordPublishedPost,
  recordRejectedTopic
} = require('./breethMemory');

// Cache the Breeth client per agent (created once, reused across cycles)
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
 * Fast keyword-based fuzzy duplicate check against SQLite memory.
 * No API cost. Used as first-pass filter.
 * @param {string} title
 * @param {string[]} existingTopics
 * @returns {boolean} true if likely duplicate
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
 * Semantic dedup via Breeth — runs ONLY on the 12-candidate batch (not all raw candidates).
 * Catches paraphrased duplicates that fuzzy matching misses.
 * @param {Array} candidates - Already sliced to ≤12 items
 * @param {object|null} breethClient
 * @param {string} agentId
 * @returns {Promise<Array>}
 */
async function deduplicateSemantically(candidates, breethClient, agentId) {
  if (!breethClient || candidates.length === 0) return candidates;

  const fresh = [];
  let dropped = 0;

  for (const c of candidates) {
    const { isDuplicate, reason } = await checkSemanticDuplicate(
      breethClient,
      c.title,
      agentId,
      0.85
    );
    if (isDuplicate) {
      dropped++;
      console.log(`[TopicDiscovery] [Semantic] Dropped: "${c.title}" — ${reason}`);
    } else {
      fresh.push(c);
    }
  }

  console.log(`[TopicDiscovery] Semantic dedup: ${dropped} dropped, ${fresh.length} remain`);
  return fresh;
}

/**
 * Persists approved and rejected decisions to Breeth memory (non-blocking).
 * Called by the scheduler after saving to SQLite.
 *
 * @param {object|null} breethClient
 * @param {string} personaName
 * @param {object|null} approvedTopic - The topic that was published (or null)
 * @param {object|null} publishedPost - The written post (or null)
 * @param {Array<{topic: string, reason: string}>} rejectedList
 * @param {string} agentId
 */
async function persistDecisionsToBreeth(breethClient, personaName, approvedTopic, publishedPost, rejectedList, agentId) {
  if (!breethClient) return;

  const tasks = [];

  if (approvedTopic && publishedPost) {
    tasks.push(recordPublishedPost(breethClient, personaName, publishedPost, approvedTopic, agentId));
  }

  for (const r of rejectedList) {
    tasks.push(recordRejectedTopic(breethClient, personaName, r.topic, r.reason, agentId));
  }

  await Promise.allSettled(tasks);
}

/**
 * Main entry point for Module B.
 *
 * Pipeline:
 *  1. Fetch raw candidates (HackerNews + NewsAPI + RSS)
 *  2. Fast SQLite fuzzy dedup (free, instant)
 *  3. Slice to top 12
 *  4. Breeth semantic dedup (12 calls max, not 44)
 *  5. Gemini editorial judgment
 *
 * @param {string} agentId
 * @param {object} persona - { name: string, domain: string }
 * @param {string[]} publishedTopics - From SQLite DB
 * @param {Array<{topic: string, reason: string}>} rejectedTopics - From SQLite DB
 * @returns {Promise<{ approved: TopicCandidate[], rejected: RejectedTopic[] }>}
 */
async function discoverAndJudgeTopics(agentId, persona, publishedTopics, rejectedTopics) {
  try {
    console.log(`[TopicDiscovery] 🔍 Starting cycle — persona: "${persona.name}" (${persona.domain})`);

    const breethClient = getBreethClient(agentId);

    // Step 1: Fetch live candidates from all sources in parallel
    const rawCandidates = await fetchAllCandidates(persona);

    if (rawCandidates.length === 0) {
      console.log('[TopicDiscovery] No candidates fetched — all sources unreachable');
      return { approved: [], rejected: [] };
    }

    console.log(`[TopicDiscovery] Fetched ${rawCandidates.length} raw candidates`);

    // Step 2: Fast SQLite fuzzy dedup (no API cost)
    const allExistingTopics = [...publishedTopics, ...rejectedTopics.map(r => r.topic)];
    const fuzzyFiltered = rawCandidates.filter(c => {
      if (isFuzzyDuplicate(c.title, allExistingTopics)) {
        console.log(`[TopicDiscovery] [Fuzzy] Dropped: "${c.title}"`);
        return false;
      }
      return true;
    });
    console.log(`[TopicDiscovery] After fuzzy dedup: ${fuzzyFiltered.length} / ${rawCandidates.length} remain`);

    if (fuzzyFiltered.length === 0) {
      console.log('[TopicDiscovery] All candidates are fuzzy duplicates');
      return { approved: [], rejected: [] };
    }

    // Step 3: Slice to top 12 BEFORE Breeth (saves API calls: 12 calls, not 44)
    const candidateBatch = fuzzyFiltered.slice(0, 12);
    console.log(`[TopicDiscovery] Batch: top ${candidateBatch.length} candidates`);

    // Step 4: Breeth semantic dedup on the small batch
    const freshCandidates = await deduplicateSemantically(candidateBatch, breethClient, agentId);

    if (freshCandidates.length === 0) {
      console.log('[TopicDiscovery] All candidates removed by semantic dedup');
      return { approved: [], rejected: [] };
    }

    // Step 5: Gemini editorial judgment
    console.log(`[TopicDiscovery] Sending ${freshCandidates.length} candidates to Gemini...`);
    const { approved, rejected } = await judgeTopicsWithGemini(
      freshCandidates,
      persona,
      publishedTopics
    );

    console.log(`[TopicDiscovery] ✅ Result: ${approved.length} approved, ${rejected.length} rejected`);
    approved.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

    return { approved, rejected };

  } catch (err) {
    console.error('[TopicDiscovery] Fatal error:', err.message);
    return { approved: [], rejected: [] };
  }
}

module.exports = { discoverAndJudgeTopics, persistDecisionsToBreeth, getBreethClient };
