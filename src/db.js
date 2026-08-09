'use strict';
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || './data/agent.db';
const dbDir = path.dirname(DB_PATH);

// Ensure the data directory exists
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

/**
 * Creates all required tables if they don't exist.
 */
function initializeSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      persona_name TEXT NOT NULL,
      persona_domain TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_run_at TEXT
    );

    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      text TEXT NOT NULL,
      rationale TEXT NOT NULL,
      sources TEXT NOT NULL,
      topic TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(agent_id) REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS rejected_topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      topic TEXT NOT NULL,
      reason TEXT NOT NULL,
      rejected_at TEXT NOT NULL
    );
  `);
  console.log('[DB] Schema initialized');
}

/**
 * Creates a new agent record.
 * @param {string} id - Unique agent ID
 * @param {string} personaName - Persona name
 * @param {string} personaDomain - Persona domain
 */
function createAgent(id, personaName, personaDomain) {
  const stmt = db.prepare(
    `INSERT INTO agents (id, persona_name, persona_domain, created_at)
     VALUES (?, ?, ?, ?)`
  );
  stmt.run(id, personaName, personaDomain, new Date().toISOString());
}

/**
 * Retrieves an agent by ID.
 * @param {string} agentId
 * @returns {object|undefined}
 */
function getAgent(agentId) {
  return db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId);
}

/**
 * Retrieves all agents.
 * @returns {Array<object>}
 */
function getAllAgents() {
  return db.prepare('SELECT * FROM agents').all();
}

/**
 * Saves a published post to the database.
 * @param {string} agentId
 * @param {object} post - { id, text, rationale, sources, topic, createdAt }
 */
function savePost(agentId, post) {
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO posts (id, agent_id, text, rationale, sources, topic, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  stmt.run(
    post.id,
    agentId,
    post.text,
    post.rationale,
    JSON.stringify(post.sources),
    post.topic,
    post.createdAt
  );
}

/**
 * Returns all posts for an agent, sorted newest first.
 * @param {string} agentId
 * @returns {Array}
 */
function getPosts(agentId) {
  const rows = db.prepare(
    `SELECT * FROM posts WHERE agent_id = ? ORDER BY created_at DESC`
  ).all(agentId);

  return rows.map(row => ({
    id: row.id,
    createdAt: row.created_at,
    text: row.text,
    rationale: row.rationale,
    sources: JSON.parse(row.sources),
    topic: row.topic
  }));
}

/**
 * Returns an array of published topic strings (for memory awareness).
 * @param {string} agentId
 * @returns {string[]}
 */
function getPublishedTopics(agentId) {
  return db.prepare(
    `SELECT topic FROM posts WHERE agent_id = ?`
  ).all(agentId).map(r => r.topic);
}

/**
 * Saves a rejected topic so it is not reconsidered.
 * @param {string} agentId
 * @param {string} topic
 * @param {string} reason
 */
function saveRejectedTopic(agentId, topic, reason) {
  db.prepare(
    `INSERT INTO rejected_topics (agent_id, topic, reason, rejected_at)
     VALUES (?, ?, ?, ?)`
  ).run(agentId, topic, reason, new Date().toISOString());
}

/**
 * Returns all previously rejected topics for an agent.
 * @param {string} agentId
 * @returns {Array<{topic: string, reason: string}>}
 */
function getRejectedTopics(agentId) {
  return db.prepare(
    `SELECT topic, reason FROM rejected_topics WHERE agent_id = ?`
  ).all(agentId);
}

/**
 * Updates the last_run_at timestamp for an agent.
 * @param {string} agentId
 */
function updateLastRun(agentId) {
  db.prepare(
    `UPDATE agents SET last_run_at = ? WHERE id = ?`
  ).run(new Date().toISOString(), agentId);
}

module.exports = {
  initializeSchema,
  createAgent,
  getAgent,
  getAllAgents,
  savePost,
  getPosts,
  getPublishedTopics,
  saveRejectedTopic,
  getRejectedTopics,
  updateLastRun
};
