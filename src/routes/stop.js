'use strict';
const express = require('express');
const { stopScheduler } = require('../scheduler');
const db = require('../db');
const router = express.Router();

router.post('/stop', (req, res) => {
  const { agentId } = req.body;
  
  if (!agentId) {
    return res.status(400).json({ error: 'agentId is required' });
  }

  const agent = db.getAgent(agentId);
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  // Stop the scheduler loop
  stopScheduler(agentId);
  
  // Optionally, you could delete the agent from the DB if you want it permanently gone,
  // but for now we just stop the active loop.
  // db.prepare('DELETE FROM agents WHERE id = ?').run(agentId);

  res.json({ status: 'stopped', message: `Agent ${agentId} has been stopped.` });
});

module.exports = router;
