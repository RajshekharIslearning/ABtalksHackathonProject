'use strict';
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db');
const initRoute = require('./routes/init');
const feedRoute = require('./routes/feed');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Initialize the database schema on startup
db.initializeSchema();

// Routes
app.use('/api/agent', initRoute);
app.use('/api/agent', feedRoute);

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

app.listen(PORT, () => {
  console.log(`[Server] Autonomous AI Persona API running on http://localhost:${PORT}`);
  console.log(`[Server] POST /api/agent/init  — Initialize the agent`);
  console.log(`[Server] GET  /api/agent/feed  — Retrieve the post feed`);
});

module.exports = app;
