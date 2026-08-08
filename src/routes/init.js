'use strict';
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { startScheduler } = require('../scheduler');
const { createBreethClient, recordPersonaInit } = require('../intelligence/breethMemory');

const router = express.Router();

/**
 * POST /api/agent/init
 * Initializes the autonomous AI persona agent.
 * Called exactly once before evaluation begins.
 */
router.post('/init', (req, res) => {
  try {
    const { persona } = req.body;

    // Validate request body
    if (!persona || !persona.name || !persona.domain) {
      return res.status(400).json({
        error: 'Invalid request. Expected: { "persona": { "name": "...", "domain": "..." } }'
      });
    }

    // Generate a unique agent ID
    const agentId = uuidv4();

    // Persist agent to database
    db.createAgent(agentId, persona.name, persona.domain);

    // Initialize Breeth memory with persona context (non-blocking)
    const breethClient = createBreethClient();
    if (breethClient) {
      recordPersonaInit(breethClient, persona.name, persona.domain, agentId)
        .then(() => console.log(`[Init] Breeth memory initialized for agent "${agentId}"`))
        .catch(err => console.error('[Init] Breeth init error (non-fatal):', err.message));
    }

    // Start the autonomous publishing loop
    startScheduler(agentId, persona);

    console.log(`[Init] Agent created: ${agentId} (${persona.name} / ${persona.domain})`);

    return res.status(201).json({ agentId });

  } catch (err) {
    console.error('[Init] Error:', err);
    return res.status(500).json({ error: 'Failed to initialize agent' });
  }
});

module.exports = router;
