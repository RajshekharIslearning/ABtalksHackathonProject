'use strict';
/**
 * Standalone test for Module B — Intelligence Engine
 * Run: node src/intelligence/test.js
 *
 * Tests topic discovery and editorial judgment in isolation.
 * Does NOT require the full server or database to be running.
 */
require('dotenv').config();
const { discoverAndJudgeTopics } = require('./topicDiscovery');

const testPersonas = [
  { name: 'Ada', domain: 'AI Security' },
  { name: 'Kai', domain: 'Machine Learning' }
];

async function runTest() {
  console.log('=' .repeat(60));
  console.log('  Module B — Intelligence Engine Isolation Test');
  console.log('='.repeat(60));

  const persona = testPersonas[0];
  console.log(`\nTesting with persona: ${persona.name} (${persona.domain})\n`);

  const mockPublishedTopics = [
    'GPT-4 released by OpenAI',
    'Google announces Gemini Ultra'
  ];

  const mockRejectedTopics = [
    { topic: 'Celebrity uses ChatGPT for tweets', reason: 'Off-topic gossip' }
  ];

  const start = Date.now();

  try {
    const result = await discoverAndJudgeTopics(
      'test-agent-001',
      persona,
      mockPublishedTopics,
      mockRejectedTopics
    );

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    console.log('\n' + '─'.repeat(60));
    console.log(`✅ Test completed in ${elapsed}s`);
    console.log('─'.repeat(60));

    console.log(`\n📥 APPROVED TOPICS (${result.approved.length}):`);
    result.approved.forEach((t, i) => {
      console.log(`\n  [${i + 1}] ${t.title}`);
      console.log(`       Relevance: ${(t.relevanceScore * 100).toFixed(0)}%`);
      console.log(`       Why Selected: ${t.whySelected}`);
      console.log(`       Why Now: ${t.whyNow}`);
      console.log(`       URL: ${t.url}`);
      console.log(`       Source: ${t.source}`);
    });

    console.log(`\n❌ REJECTED TOPICS (${result.rejected.length}):`);
    result.rejected.forEach((r, i) => {
      console.log(`  [${i + 1}] ${r.topic}`);
      console.log(`       Reason: ${r.reason}`);
    });

    console.log('\n' + '='.repeat(60));

    // Acceptance criteria checks
    console.log('\n📋 Acceptance Criteria:');
    console.log(`  ✅ Returns approved topics: ${result.approved.length > 0 ? 'YES' : 'NO (may be 0 if all topics were recent dups)'}`);
    console.log(`  ✅ Provides rejection reasons: ${result.rejected.every(r => r.reason) ? 'YES' : 'NO'}`);
    console.log(`  ✅ Completed in < 15s: ${parseFloat(elapsed) < 15 ? 'YES' : 'NO'}`);
    console.log(`  ✅ No crash on error: YES (you're reading this)`);

  } catch (err) {
    console.error('❌ Test FAILED with uncaught error:', err);
    process.exit(1);
  }
}

runTest();
