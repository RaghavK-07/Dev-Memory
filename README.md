# 🧠 DevMemory — The Coding Agent that Learns from Mistakes
> **Track 1: Agentic Memory Challenge Entry**  
> *Persistent, self-correcting coding memory powered by MongoDB Atlas Vector Search, TTL Expiry, and Real-Time Change Streams.*

---

## 📌 Problem & Motivation
AI coding assistants repeatedly suggest fixes that have already failed, ignore project-specific constraints, or repeat costly anti-patterns across developer sessions.

**DevMemory** transforms AI coding into an adaptive pair programming system that remembers architecture, coding conventions, bugs, failed fixes, successful solutions, and project decisions. Every memory visibly changes the agent's next response, prevents repeated mistakes, and automatically adapts when team decisions evolve.

---

## 🚀 Key Features & MongoDB Capabilities

| MongoDB Capability | How DevMemory Uses It |
|---|---|
| **Document Modeling** | Models each memory with `owner`, `workspace`, `type`, structured problem/outcome/recommendation `content`, provenance `source`, `lifecycle` (`status`, `confidence`, `supersededBy`, `expiresAt`), and 384-dimensional `embedding`. |
| **Vector Search (`$vectorSearch`)** | Semantic recall matching developer queries or stack traces against prior memories, scoped by `workspace` metadata filters and `lifecycle.status == 'active'`. |
| **TTL Indexes (`expireAfterSeconds: 0`)** | Automatically purges ephemeral debug memories, trial cache flags, or short-lived investigation notes when `lifecycle.expiresAt` elapses. |
| **Change Streams (`collection.watch()`)** | Real-time SSE synchronization across multi-agent sessions and teammates. When a memory is recorded, superseded, or deleted, all active clients update instantly. |
| **Conflict & Superseding Logic** | When architectural rules change (e.g. migrating from JWT to Redis session store), DevMemory links the old memory (`status: 'superseded'`) to the new constraint document. |

---

## 🎬 4-Act Demo Walkthrough (Challenge Verification)

### Act 1: The Costly Mistake (Recording the Memory)
- In **Session #1**, a developer asks how to solve 15-minute JWT expiration in auth middleware.
- An intuitive but broken suggestion is attempted: *"Allow client middleware to re-sign token expiration"*.
- Simulated test suite (`tests/auth.test.ts`) fails due to clock skew and replay vulnerability.
- DevMemory captures this failure as a `failed_fix` document with high confidence and stores it in MongoDB Atlas.

### Act 2: The Later Session (Semantic Recall & Visible Behavior Change)
- In **Session #2** (a fresh session or another teammate), a developer asks:  
  `"Users keep getting 401 Unauthorized errors after 15 minutes due to expired tokens. How should we fix this?"`
- DevMemory performs **MongoDB Vector Search** and retrieves Memory `#f96476` (Relevance: 78.6%).
- **Visibly changes behavior:** Instead of repeating the naive fix, the agent displays an explicit warning citing the prior failure, explains why client-side signing was rejected, and recommends the verified pattern: *Server-managed Sliding Session with Rotating Refresh Tokens*.

### Act 3: Memory Inspection & Selection Explainability
- Click **"Inspect"** on any memory to see:
  - **Vector Cosine Similarity Score** (e.g. 78.6%)
  - **Workspace Match** (`auth-service`)
  - **Lifecycle Status Filter** (`active` vs `superseded`)
  - **Telemetry Log**: Exact timestamps, session IDs, and queries that triggered previous recalls.
  - Raw MongoDB BSON/JSON document view.

### Act 4: Difficult Cases (Correction, Conflict & Expiry)
- **Case 4A (Constraint Correction & Superseding):**  
  The lead architect decides: *"We migrated to Redis Distributed Session Store. Stateless JWT refresh tokens are deprecated; use Redis sliding session TTL."*  
  DevMemory supersedes the old JWT memory (`status: 'superseded'`, `supersededBy: <new_id>`) and creates the new constraint. Future queries immediately enforce the Redis rule and bypass the old advice.
- **Case 4B (TTL Automatic Expiry):**  
  Insert a temporary debug note with a 45-second TTL. A live countdown badge appears, and MongoDB's background TTL thread purges the document.
- **Case 4C (Cross-Workspace Isolation):**  
  Metadata filters ensure memories from `payment-gateway` or `checkout-api` never bleed into `auth-service`.

---

## 🛠️ Quickstart & Local Setup

### 1. Prerequisites
- Node.js >= 18
- MongoDB Atlas Cluster or local MongoDB instance

### 2. Environment Configuration
Create or edit `.env` in the root directory:
```env
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
DB_NAME=devmemory_db
PORT=4000
```

### 3. Install & Start
```bash
# Install root and client dependencies
npm install
npm --prefix client install

# Build client for production
npm run build

# Start the unified server (serves API & UI on port 4000)
npm start
```
Open **[http://localhost:4000](http://localhost:4000)** in your browser!

---

## 🔍 Atlas Vector Search Index Specifier
To enable hardware-accelerated `$vectorSearch` in your MongoDB Atlas cluster:
1. Go to **MongoDB Atlas** &rarr; **Clusters** &rarr; **Atlas Search**.
2. Click **Create Search Index** &rarr; **JSON Editor**.
3. Select database `devmemory_db` and collection `memories`.
4. Paste the following definition and name it `vector_index`:

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
*(Note: DevMemory includes built-in hybrid similarity search that works immediately while your Atlas index is building!)*

---

## 📂 Project Structure
```
/Users/raghavk/Programs/Dev Memory
├── server/
│   ├── index.js            # Express server & static asset handler
│   ├── db.js               # Atlas connection, indexes & Change Stream manager
│   ├── memoryModel.js      # Document schema, lifecycle & vector search repository
│   ├── embeddings.js       # 384-dimensional vector generator & similarity engine
│   ├── agentService.js     # Agent reasoning, recall synthesis & scenario runner
│   ├── seed.js             # Realistic seed memories across multiple workspaces
│   └── routes/
│       ├── memories.js     # CRUD & Vector Search REST endpoints
│       ├── agent.js        # Interactive chat & demo simulation routes
│       ├── stream.js       # Real-time SSE Change Stream broadcaster
│       └── system.js       # Healthcheck & Atlas vector index helper
├── client/
│   ├── index.html
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx         # Main application controller & SSE subscriber
│       └── components/
│           ├── Navbar.jsx               # Workspace selector & cluster telemetry
│           ├── AgentSession.jsx         # Multi-session chat & behavioral alerts
│           ├── MemoryHub.jsx            # Memory card gallery & TTL countdowns
│           ├── MemoryInspectorModal.jsx # Deep BSON inspector & superseding modal
│           ├── DemoWalkthrough.jsx      # 1-click interactive presentation player
│           ├── ArchitectureDocs.jsx     # Schema diagrams & index definitions
│           └── LiveStreamDrawer.jsx     # Real-time Change Stream activity drawer
└── package.json
```
