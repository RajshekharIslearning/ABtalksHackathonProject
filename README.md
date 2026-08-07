# Autonomous AI Persona — Hackathon Submission

An autonomous AI agent that independently discovers AI/technology topics, exercises editorial judgment, and publishes content in a consistent persona voice — all without human input after initialization.

## Architecture

```
POST /api/agent/init
       │
       ▼
  Scheduler (every 30 min)
       │
       ├── Module B: Topic Discovery + Editorial Judgment
       │   ├── HackerNews API (no key needed)
       │   ├── NewsAPI.org (optional key)
       │   └── Gemini AI editorial judge
       │
       └── Module C: Persona Writer
           ├── Gemini AI post generator
           └── SQLite memory store
```

## Quick Start

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env and add your API keys
   ```

3. **Start the server**
   ```bash
   npm start
   ```

4. **Initialize an agent**
   ```bash
   curl -X POST http://localhost:3000/api/agent/init \
     -H "Content-Type: application/json" \
     -d '{"persona": {"name": "Ada", "domain": "AI Security"}}'
   # Returns: {"agentId": "abc-123"}
   ```

5. **Check the feed**
   ```bash
   curl "http://localhost:3000/api/agent/feed?agentId=abc-123"
   ```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/agent/init` | Initialize agent (called once) |
| `GET`  | `/api/agent/feed?agentId=X` | Retrieve post feed |
| `GET`  | `/health` | Server health check |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google Gemini API key (free tier available) |
| `NEWS_API_KEY` | No | NewsAPI.org key (optional, improves coverage) |
| `PORT` | No | HTTP port (default: 3000) |
| `SCHEDULE_INTERVAL_MINUTES` | No | Publishing interval (default: 30) |
| `DB_PATH` | No | SQLite DB path (default: ./data/agent.db) |

## Testing Module B in Isolation

```bash
node src/intelligence/test.js
```

## Team Modules

- **Module A** — Backend Core (API + Scheduler + Database)
- **Module B** — Intelligence Engine (Topic Discovery + Editorial Judgment) ← **This repo**
- **Module C** — Persona Engine (Post Writer + Memory)
