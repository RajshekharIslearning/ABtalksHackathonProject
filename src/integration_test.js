'use strict';
require('dotenv').config();

const { discoverAndJudgeTopics } = require('./intelligence/topicDiscovery');
const { writeAndPublishPost } = require('./persona/writer');

const TEST_AGENT_ID = 'integration-test-agent-001';
const TEST_PERSONA = { name: 'Ada', domain: 'AI Security' };

async function runIntegrationTest() {
  console.log('============================================================');
  console.log('  Testing Integration: Module B (Intelligence) + Module C (Writer)');
  console.log('============================================================\n');

  console.log('[1/2] Running Module B: Topic Discovery & Editorial Judgment...');
  // Pass empty arrays for published/rejected topics for the test
  const discoveryResult = await discoverAndJudgeTopics(TEST_AGENT_ID, TEST_PERSONA, [], []);

  if (!discoveryResult || discoveryResult.approved.length === 0) {
    console.log('❌ Module B failed to find or approve any topics. Cannot test Module C.');
    console.log('Rejected topics:', discoveryResult?.rejected || []);
    return;
  }

  const topTopic = discoveryResult.approved[0];
  console.log(`\n✅ Module B approved topic: "${topTopic.title}"`);
  console.log(`   Source: ${topTopic.url}`);
  console.log(`   Why Selected: ${topTopic.whySelected}`);

  console.log('\n[2/2] Running Module C: Persona Writer...');
  try {
    const post = await writeAndPublishPost(TEST_AGENT_ID, TEST_PERSONA, topTopic);
    
    if (post) {
      console.log('\n✅ Module C successfully wrote the post!');
      console.log('------------------------------------------------------------');
      console.log(`ID: ${post.id}`);
      console.log(`Text:\n${post.text}`);
      console.log('------------------------------------------------------------');
      console.log('Rationale:');
      console.log(JSON.stringify(post.rationale, null, 2));
      console.log('Sources:', post.sources);
    } else {
      console.log('\n❌ Module C failed to write the post (returned null).');
    }
  } catch (err) {
    console.error('\n❌ Module C threw an error:', err);
  }
}

runIntegrationTest().catch(console.error);
