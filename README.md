# DevMemory

Persistent coding agent that remembers architecture, constraints, and past failed fixes using MongoDB Atlas Vector Search.

---

## Overview

AI coding assistants frequently repeat previously failed fixes or ignore workspace-specific constraints across sessions. **DevMemory** provides persistent, self-correcting agent memory stored directly in MongoDB Atlas.

When a developer interacts with the assistant:
1. The assistant performs semantic vector search over past bugs, failed attempts, and constraints in the workspace.
2. If an attempted solution has previously failed, the assistant explicitly flags the known failure invariant and proposes the verified architecture.
3. When an implementation fails tests or review, developers record the post-mortem, and the assistant indexes it into MongoDB Atlas to prevent repeating the mistake.

---

## Technical Architecture

- **Document Model**: Memories are modeled with `owner`, `workspace`, `type` (`failed_fix`, `constraint`, `convention`, `architecture`), structured problem/outcome/recommendation content, `lifecycle` state (`status`, `confidence`, `supersededBy`, `expiresAt`), and 384-dimensional vector embeddings.
- **MongoDB Vector Search**: Scoped semantic recall combining `$vectorSearch` with metadata filters on `workspace` and `lifecycle.status == 'active'`.
- **TTL Indexes**: Automatic expiration of short-lived investigation traces and ephemeral cache notes via `lifecycle.expiresAt` (`expireAfterSeconds: 0`).
- **Change Streams**: Real-time multi-agent synchronization via `collection.watch()` and Server-Sent Events.

---

## Getting Started

### Quick Start (One Command)

After cloning the repository:

```bash
chmod +x start.sh
./start.sh
```

This automatically installs dependencies, builds the frontend, and launches the server at `http://localhost:4000`.

---

### Manual Setup

```bash
# 1. Install dependencies
npm install
npm --prefix client install

# 2. Build frontend bundle
npm run build

# 3. Configure environment
cp .env.example .env
# Edit .env with your MongoDB Atlas URI if needed

# 4. Start the server
npm start
```

Access the interface at `http://localhost:4000`.

---

## MongoDB Atlas Vector Search Index Definition

In MongoDB Atlas &rarr; Clusters &rarr; Atlas Search &rarr; Create Search Index (JSON Editor):
Target: `devmemory_db.memories` | Name: `vector_index`

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 384,
      "similarity": "cosine"
    },
    {
      "type": "filter",
      "path": "workspace"
    },
    {
      "type": "filter",
      "path": "lifecycle.status"
    },
    {
      "type": "filter",
      "path": "type"
    },
    {
      "type": "filter",
      "path": "lifecycle.privacy"
    }
  ]
}
```

*(DevMemory includes built-in hybrid similarity search so queries work immediately while the Atlas index syncs).*
