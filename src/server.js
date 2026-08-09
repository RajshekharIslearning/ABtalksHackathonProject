'use strict';
require('dotenv').config({ quiet: true });
const express = require('express');
const cors = require('cors');
const db = require('./db');
const initRoute = require('./routes/init');
const feedRoute = require('./routes/feed');
const stopRoute = require('./routes/stop');

const app = express();
const PORT = process.env.PORT || 3000;

const path = require('path');

app.use(cors());
app.use(express.json());

// Serve static frontend files from 'public' directory
app.use(express.static(path.join(__dirname, '../public')));

// Initialize the database schema on startup
db.initializeSchema();

// Resume schedulers for any existing agents
const { startScheduler } = require('./scheduler');
const agents = db.getAllAgents();
for (const agent of agents) {
  const persona = { name: agent.persona_name, domain: agent.persona_domain };
  console.log(`[Server] Resuming scheduler for agent: ${agent.id}`);
  startScheduler(agent.id, persona);
}

// Routes
app.use('/api/agent', initRoute);
app.use('/api/agent', feedRoute);
app.use('/api/agent', stopRoute);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Server] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Autonomous AI Persona API running on http://localhost:${PORT}`);
  console.log(`[Server] POST /api/agent/init  — Initialize the agent`);
  console.log(`[Server] GET  /api/agent/feed  — Retrieve the post feed`);
});

module.exports = app;
