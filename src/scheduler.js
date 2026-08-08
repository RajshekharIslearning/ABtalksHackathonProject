'use strict';
const cron = require('node-cron');
const db = require('./db');
const { discoverAndJudgeTopics, persistDecisionsToBreeth, getBreethClient } = require('./intelligence/topicDiscovery');
const { recordPersonaInit } = require('./intelligence/breethMemory');
const { writeAndPublishPost } = require('./persona/writer');

const INTERVAL = parseInt(process.env.SCHEDULE_INTERVAL_MINUTES) || 30;

// Track running schedulers to avoid duplicate jobs
const activeSchedulers = new Map();

/**
 * Runs a single autonomous cycle: discover → judge → write → save.
 * @param {string} agentId
 * @param {object} persona - { name, domain }
 */
async function runCycle(agentId, persona) {
  console.log(`\n[Scheduler] ⚡ Starting cycle for agent "${agentId}" (${persona.name} / ${persona.domain})`);
  const cycleStart = Date.now();

  try {
    // 1. Load memory from DB
    const publishedTopics = db.getPublishedTopics(agentId);
    const rejectedTopics = db.getRejectedTopics(agentId);

    console.log(`[Scheduler] Memory: ${publishedTopics.length} published, ${rejectedTopics.length} rejected topics`);

    // 2. Discover and judge topics (Module B)
    const { approved, rejected } = await discoverAndJudgeTopics(
      agentId,
      persona,
      publishedTopics,
      rejectedTopics
    );

    console.log(`[Scheduler] Topics: ${approved.length} approved, ${rejected.length} rejected`);

    // 3. Save rejected topics to SQLite DB
    for (const r of rejected) {
      db.saveRejectedTopic(agentId, r.topic, r.reason);
    }

    // 4. Write and publish the top approved topic (Module C)
    let publishedPost = null;
    let publishedTopic = null;

    if (approved.length > 0) {
      const topTopic = approved[0];
      console.log(`[Scheduler] Writing post about: "${topTopic.title}"`);

      const post = await writeAndPublishPost(agentId, persona, topTopic);

      if (post) {
        db.savePost(agentId, post);
        publishedPost = post;
        publishedTopic = topTopic;
        console.log(`[Scheduler] ✅ Published post "${post.id}": ${post.text.substring(0, 80)}...`);
      } else {
        console.log('[Scheduler] ⚠️  Writer returned null — skipping this cycle');
      }
    } else {
      console.log('[Scheduler] No approved topics this cycle — nothing published');
    }

    // 5. Persist decisions to Breeth memory (non-blocking — runs in background)
    //    This gives the agent semantic, intent-aware long-term memory
    const breethClient = getBreethClient(agentId);
    persistDecisionsToBreeth(
      breethClient,
      persona.name,
      publishedTopic,
      publishedPost,
      rejected,
      agentId
    ).catch(err => console.error('[Scheduler] Breeth persistence error (non-fatal):', err.message));

    // 5. Update last run timestamp
    db.updateLastRun(agentId);

    const elapsed = ((Date.now() - cycleStart) / 1000).toFixed(1);
    console.log(`[Scheduler] Cycle complete in ${elapsed}s\n`);

  } catch (err) {
    console.error(`[Scheduler] ❌ Cycle error for agent "${agentId}":`, err.message);
    // Never crash — the scheduler must keep running
  }
}

/**
 * Starts the autonomous scheduler for an agent.
 * Runs one cycle immediately, then every INTERVAL minutes.
 * @param {string} agentId
 * @param {object} persona
 */
function startScheduler(agentId, persona) {
  if (activeSchedulers.has(agentId)) {
    console.log(`[Scheduler] Scheduler already running for agent "${agentId}"`);
    return;
  }

  console.log(`[Scheduler] Starting autonomous loop for "${agentId}" — every ${INTERVAL} minutes`);

  // Run immediately on initialization (don't wait for first cron tick)
  setImmediate(() => runCycle(agentId, persona));

  // Construct safe cron expression for any interval
  let cronExpr = `*/${INTERVAL} * * * *`;
  if (INTERVAL >= 60) {
    const hours = Math.max(1, Math.floor(INTERVAL / 60));
    cronExpr = `0 */${hours} * * *`;
  }

  // Schedule recurring autonomous runs
  const task = cron.schedule(cronExpr, () => {
    runCycle(agentId, persona);
  });

  activeSchedulers.set(agentId, task);
}

/**
 * Stops the scheduler for an agent (for testing/cleanup).
 * @param {string} agentId
 */
function stopScheduler(agentId) {
  const task = activeSchedulers.get(agentId);
  if (task) {
    task.stop();
    activeSchedulers.delete(agentId);
    console.log(`[Scheduler] Stopped scheduler for agent "${agentId}"`);
  }
}

module.exports = { startScheduler, stopScheduler, runCycle };
