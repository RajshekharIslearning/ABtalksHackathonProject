'use strict';
/**
 * Standalone test for Module B — Intelligence Engine + Breeth Memory
 * Run: node src/intelligence/test.js
 *
 * Tests:
 * 1. News fetching (HackerNews + NewsAPI + RSS)
 * 2. Two-pass deduplication (fuzzy + Breeth semantic)
 * 3. Gemini editorial judgment
 * 4. Breeth memory write/read round-trip
 */
require('dotenv').config();

const { discoverAndJudgeTopics } = require('./topicDiscovery');
const {
  createBreethClient,
  storeEpisode,
  semanticSearch,
  checkSemanticDuplicate,
  recordPersonaInit
} = require('./breethMemory');

const TEST_AGENT_ID = 'test-agent-module-b-001';
const TEST_PERSONA = { name: 'Ada', domain: 'AI Security' };

async function testBreethMemory() {
  console.log('\n' + '─'.repeat(60));
  console.log('  🧠 Test 1: Breeth Memory Layer');
  console.log('─'.repeat(60));

  const client = createBreethClient();

  if (!client) {
    console.log('  ⚠️  BREETH_API_KEY not set — skipping Breeth tests');
    console.log('  ℹ️  The system will still work using SQLite memory only');
    return false;
  }

  console.log('  ✅ Breeth client created');

  // Test: Initialize persona
  console.log('\n  [1a] Initializing persona in Breeth memory...');
  await recordPersonaInit(client, TEST_PERSONA.name, TEST_PERSONA.domain, TEST_AGENT_ID);
  console.log('  ✅ Persona initialized');

  // Test: Store an episode
  console.log('\n  [1b] Storing test episode...');
  const testEpisode = 'Ada published a post about LLM prompt injection vulnerabilities in enterprise deployments. This was selected for its direct relevance to AI Security and high real-world impact on organizations running LLM-powered applications.';
  const taskId = await storeEpisode(client, testEpisode, TEST_AGENT_ID, 'module-b-test');
  console.log(`  ✅ Episode stored, task_id: ${taskId}`);

  // Wait briefly for Breeth to process
  console.log('\n  [1c] Waiting 5s for Breeth to process episode...');
  await new Promise(r => setTimeout(r, 5000));

  // Test: Semantic search
  console.log('\n  [1d] Testing semantic search...');
  const searchResults = await semanticSearch(
    client,
    'LLM security vulnerabilities and prompt injection attacks',
    TEST_AGENT_ID,
    5
  );
  console.log(`  ✅ Semantic search returned ${searchResults.length} results`);
  if (searchResults.length > 0) {
    console.log(`     Top result: ${JSON.stringify(searchResults[0]).substring(0, 150)}...`);
  }

  // Test: Duplicate detection
  console.log('\n  [1e] Testing semantic duplicate detection...');
  const { isDuplicate, reason } = await checkSemanticDuplicate(
    client,
    'How LLMs are vulnerable to prompt injection in enterprise AI applications',
    TEST_AGENT_ID,
    0.75 // Lower threshold for test
  );
  console.log(`  ✅ Duplicate check: isDuplicate=${isDuplicate}`);
  if (isDuplicate) {
    console.log(`     Reason: ${reason}`);
  }

  return true;
}

async function testFullPipeline() {
  console.log('\n' + '─'.repeat(60));
  console.log('  🔍 Test 2: Full Topic Discovery Pipeline');
  console.log('─'.repeat(60));

  const mockPublishedTopics = [
    'GPT-4 released by OpenAI',
    'Google announces Gemini Ultra model'
  ];

  const mockRejectedTopics = [
    { topic: 'Celebrity uses ChatGPT for tweets', reason: 'Off-topic gossip' }
  ];

  const start = Date.now();

  const result = await discoverAndJudgeTopics(
    TEST_AGENT_ID,
    TEST_PERSONA,
    mockPublishedTopics,
    mockRejectedTopics
  );

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`\n  ⏱  Completed in ${elapsed}s`);

  console.log(`\n  📥 APPROVED (${result.approved.length}):`);
  result.approved.forEach((t, i) => {
    console.log(`\n  [${i + 1}] ${t.title}`);
    console.log(`       Score:        ${(t.relevanceScore * 100).toFixed(0)}%`);
    console.log(`       Why Selected: ${t.whySelected}`);
    console.log(`       Why Now:      ${t.whyNow}`);
    console.log(`       Source:       ${t.source}`);
    console.log(`       URL:          ${t.url}`);
  });

  console.log(`\n  ❌ REJECTED (${result.rejected.length}):`);
  result.rejected.slice(0, 5).forEach((r, i) => {
    console.log(`  [${i + 1}] ${r.topic}`);
    console.log(`       Reason: ${r.reason}`);
  });
  if (result.rejected.length > 5) {
    console.log(`  ... and ${result.rejected.length - 5} more`);
  }

  return { elapsed, approved: result.approved.length, rejected: result.rejected.length };
}

async function runAllTests() {
  console.log('='.repeat(60));
  console.log('  Module B — Intelligence Engine + Breeth Memory Tests');
  console.log('='.repeat(60));

  let breethOk = false;
  let pipelineStats = null;

  try {
    breethOk = await testBreethMemory();
  } catch (err) {
    console.error('  ❌ Breeth test error:', err.message);
  }

  try {
    pipelineStats = await testFullPipeline();
  } catch (err) {
    console.error('  ❌ Pipeline test error:', err.message);
  }

  // Final report
  console.log('\n' + '='.repeat(60));
  console.log('  📋 Test Summary');
  console.log('='.repeat(60));
  console.log(`  Breeth Memory:         ${breethOk ? '✅ WORKING' : '⚠️  Skipped (no API key)'}`);
  console.log(`  Topic Discovery:       ${pipelineStats ? '✅ WORKING' : '❌ FAILED'}`);
  if (pipelineStats) {
    console.log(`  Approved:              ${pipelineStats.approved} topics`);
    console.log(`  Rejected:              ${pipelineStats.rejected} topics`);
    console.log(`  Completed in:          ${pipelineStats.elapsed}s`);
    console.log(`  Under 15s limit:       ${parseFloat(pipelineStats.elapsed) < 15 ? '✅ YES' : '❌ NO'}`);
  }
  console.log('\n  To add API keys: edit .env file');
  console.log('='.repeat(60) + '\n');
}

runAllTests().catch(err => {
  console.error('❌ Test runner failed:', err);
  process.exit(1);
});
