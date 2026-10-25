const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const dbManager = require('./db');
const memoriesRoute = require('./routes/memories');
const agentRoute = require('./routes/agent');
const { router: streamRoute } = require('./routes/stream');
const systemRoute = require('./routes/system');

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logger
app.use((req, res, next) => {
  if (req.path !== '/api/stream' && !req.path.startsWith('/assets/')) {
    console.log(`[${new Date().toISOString().slice(11, 19)}] ${req.method} ${req.path}`);
  }
  next();
});

// API Routes (mounted with and without /api prefix for local and serverless/Vercel compatibility)
app.use('/api/memories', memoriesRoute);
app.use('/memories', memoriesRoute);
app.use('/api/agent', agentRoute);
app.use('/agent', agentRoute);
app.use('/api/stream', streamRoute);
app.use('/stream', streamRoute);
app.use('/api/system', systemRoute);
app.use('/system', systemRoute);

// API 404 Handler: always return JSON (never HTML) for /api requests
app.use(['/api', '/api/*'], (req, res) => {
  res.status(404).json({ success: false, error: `Endpoint not found: ${req.method} ${req.originalUrl || req.url}` });
});

// Serve static frontend when running locally (on Vercel, static files are served by CDN edge)
if (!process.env.VERCEL) {
  const clientDistPath = path.join(__dirname, '../client/dist');
  const rootDistPath = path.join(__dirname, '../dist');
  const distPath = fs.existsSync(clientDistPath) ? clientDistPath : (fs.existsSync(rootDistPath) ? rootDistPath : null);

  if (distPath) {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(distPath, 'index.html'));
      }
    });
  }
}

// Start server
async function start() {
  try {
    console.log('[DevMemory] Initializing server...');
    
    // Connect to MongoDB Atlas
    await dbManager.connect();

    app.listen(PORT, () => {
      console.log(`\n======================================================`);
      console.log(` DevMemory Server running on http://localhost:${PORT}`);
      console.log(` MongoDB Atlas Connected: ${process.env.DB_NAME || 'devmemory_db'}`);
      console.log(` Change Stream SSE: http://localhost:${PORT}/api/stream`);
      console.log(`======================================================\n`);
    });
  } catch (err) {
    console.error('Failed to start DevMemory server:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = app;

process.on('SIGINT', async () => {
  console.log('\nShutting down DevMemory server gracefully...');
  if (dbManager.client) {
    await dbManager.client.close();
  }
  process.exit(0);
});
