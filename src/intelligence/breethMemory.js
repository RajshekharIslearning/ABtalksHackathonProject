'use strict';
/**
 * Breeth Memory Client — Module B
 *
 * Wraps the Breeth intent-aware memory API (https://api.thebreeth.com/v1)
 * to give the autonomous agent persistent, semantic memory across sessions.
 *
 * Used for:
 * 1. Storing published post decisions (what was published + why)
 * 2. Storing rejected topic decisions (what was rejected + why)
 * 3. Semantic search to detect truly similar past topics
 * 4. Recording editorial patterns (what kinds of topics Ada consistently favors)
 */

const axios = require('axios');

const BREETH_BASE_URL = 'https://api.thebreeth.com/v1';

/**
 * Creates an authenticated Axios instance for the Breeth API.
 * @returns {import('axios').AxiosInstance}
 */
function createBreethClient() {
  const apiKey = process.env.BREETH_API_KEY;
  if (!apiKey || apiKey === 'your_breeth_api_key_here') {
    return null; // Graceful fallback — memory still works via SQLite
  }

  return axios.create({
    baseURL: BREETH_BASE_URL,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    timeout: 10000
  });
}

/**
 * Stores an "episode" (a narrative memory event) in Breeth.
 * Used for rich, context-aware memories like publishing decisions.
 *
 * @param {object} client - Authenticated Axios instance
 * @param {string} content - Free-text narrative of the event
 * @param {string} groupId - Agent ID used as the memory group
 * @param {string} sourceDescription - Label for the source
 * @returns {Promise<string|null>} task_id if successful, null on error
 */
async function storeEpisode(client, content, groupId, sourceDescription = 'autonomous-ai-agent') {
  try {
    const resp = await client.post('/episodes', {
      content,
      group_id: groupId,
      source_description: sourceDescription
    });
    const taskId = resp.data?.cogram?.task_id || null;
    console.log(`[Breeth] Episode stored, task_id: ${taskId}`);
    return taskId;
  } catch (err) {
    console.error('[Breeth] storeEpisode error:', err.response?.data || err.message);
    return null;
  }
}

/**
 * Stores a structured Subject-Predicate-Object fact in Breeth.
 * Better for clean, searchable assertions about editorial decisions.
 *
 * @param {object} client - Authenticated Axios instance
 * @param {string} subject - e.g., "Ada"
 * @param {string} predicate - e.g., "rejected_topic"
 * @param {string} object - e.g., "Celebrity uses ChatGPT for tweets"
 * @param {string} groupId - Agent ID used as the memory group
 * @returns {Promise<boolean>}
 */
async function storeFact(client, subject, predicate, object, groupId) {
  try {
    const resp = await client.post('/facts', {
      subject,
      predicate,
      object,
      group_id: groupId
    });
    console.log(`[Breeth] Fact stored: "${subject} ${predicate} ${object}"`);
    return true;
  } catch (err) {
    console.error('[Breeth] storeFact error:', err.response?.data || err.message);
    return false;
  }
}

/**
 * Performs semantic search across the agent's Breeth memory graph.
 * Returns the most relevant past memories for a given topic/query.
 *
 * @param {object} client - Authenticated Axios instance
 * @param {string} query - Search query (e.g., a candidate topic title)
 * @param {string} groupId - Agent ID to scope the search
 * @param {number} limit - Max number of results (default: 10)
 * @returns {Promise<Array<{content: string, score: number}>>}
 */
async function semanticSearch(client, query, groupId, limit = 10) {
  try {
    const resp = await client.post('/search', {
      query,
      group_id: groupId,
      limit
    });

    const results = resp.data?.results || resp.data?.edges || [];
    console.log(`[Breeth] Semantic search for "${query.substring(0, 50)}..." → ${results.length} results`);
    return results;
  } catch (err) {
    console.error('[Breeth] semanticSearch error:', err.response?.data || err.message);
    return [];
  }
}

/**
 * Checks if a candidate topic is semantically too similar to past memories.
 * Uses Breeth's semantic search to find related past topics.
 *
 * @param {object} client - Authenticated Axios instance
 * @param {string} candidateTitle - The new candidate topic title
 * @param {string} groupId - Agent ID
 * @param {number} similarityThreshold - Score above which we consider it a duplicate (0-1)
 * @returns {Promise<{isDuplicate: boolean, reason: string|null}>}
 */
async function checkSemanticDuplicate(client, candidateTitle, groupId, similarityThreshold = 0.85) {
  const results = await semanticSearch(client, candidateTitle, groupId, 5);

  if (!results || results.length === 0) {
    return { isDuplicate: false, reason: null };
  }

  // Look for high-similarity matches in past published/rejected topics
  for (const result of results) {
    const score = result.score ?? result.similarity ?? result.relevance_score ?? 0;
    const content = result.content || result.fact || result.edge || '';

    if (score >= similarityThreshold) {
      return {
        isDuplicate: true,
        reason: `Semantically similar to past memory (score: ${score.toFixed(2)}): "${content.substring(0, 100)}"`
      };
    }
  }

  return { isDuplicate: false, reason: null };
}

/**
 * Records a published post to Breeth memory.
 * Stores both a structured fact and a rich narrative episode.
 *
 * @param {object} client - Authenticated Axios instance
 * @param {string} personaName - e.g., "Ada"
 * @param {object} post - The published post object
 * @param {object} topic - The approved topic object
 * @param {string} groupId - Agent ID
 */
async function recordPublishedPost(client, personaName, post, topic, groupId) {
  // Store as a structured fact
  await storeFact(
    client,
    personaName,
    'published_post_about',
    topic.title,
    groupId
  );

  // Store as a rich episode with full context
  const episode = `${personaName} published a post about "${topic.title}". 
Post rationale: ${topic.whySelected}. 
Why it was timely: ${topic.whyNow}. 
Relevance score: ${topic.relevanceScore || 'N/A'}. 
Source: ${topic.url}. 
Published at: ${post.createdAt}.`;

  await storeEpisode(client, episode, groupId, 'post-published');
}

/**
 * Records a rejected topic to Breeth memory.
 * Helps the agent remember editorial decisions over time.
 *
 * @param {object} client - Authenticated Axios instance
 * @param {string} personaName - e.g., "Ada"
 * @param {string} topicTitle - The rejected topic title
 * @param {string} reason - Why it was rejected
 * @param {string} groupId - Agent ID
 */
async function recordRejectedTopic(client, personaName, topicTitle, reason, groupId) {
  // Store as structured fact
  await storeFact(
    client,
    personaName,
    'rejected_topic',
    topicTitle,
    groupId
  );

  // Store as episode with reasoning
  const episode = `${personaName} rejected the topic "${topicTitle}" with reason: ${reason}`;
  await storeEpisode(client, episode, groupId, 'topic-rejected');
}

/**
 * Records the agent's persona initialization to Breeth memory.
 * Helps establish context for future memory queries.
 *
 * @param {object} client - Authenticated Axios instance
 * @param {string} personaName
 * @param {string} personaDomain
 * @param {string} groupId
 */
async function recordPersonaInit(client, personaName, personaDomain, groupId) {
  const episode = `${personaName} is an autonomous AI and technology expert specializing in ${personaDomain}. 
They independently discover topics, exercise editorial judgment, and publish insightful posts. 
They value technical depth, real-world impact, and original perspectives. 
They reject clickbait, gossip, and superficial AI-hype content.`;

  await storeEpisode(client, episode, groupId, 'persona-initialization');

  await storeFact(client, personaName, 'specializes_in', personaDomain, groupId);
  await storeFact(client, personaName, 'rejects', 'clickbait and superficial AI content', groupId);
  await storeFact(client, personaName, 'values', 'technical depth and real world impact', groupId);
}

module.exports = {
  createBreethClient,
  storeEpisode,
  storeFact,
  semanticSearch,
  checkSemanticDuplicate,
  recordPublishedPost,
  recordRejectedTopic,
  recordPersonaInit
};
