'use strict';
const express = require('express');
const db = require('../db');

const router = express.Router();

/**
 * GET /api/agent/feed?agentId=abc-123
 * Returns the agent's published post feed in reverse chronological order.
 */
router.get('/feed', (req, res) => {
  try {
    const { agentId } = req.query;

    if (!agentId) {
      return res.status(400).json({ error: 'Missing required query parameter: agentId' });
    }

    // Verify agent exists
    const agent = db.getAgent(agentId);
    if (!agent) {
      return res.status(404).json({ error: `Agent "${agentId}" not found` });
    }

    // Fetch posts from DB (already sorted newest-first)
    const posts = db.getPosts(agentId);

    return res.status(200).json({ posts });

  } catch (err) {
    console.error('[Feed] Error:', err);
    return res.status(500).json({ error: 'Failed to retrieve feed' });
  }
});

module.exports = router;
