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

// API Routes
app.use('/api/memories', memoriesRoute);
app.use('/api/agent', agentRoute);
app.use('/api/stream', streamRoute);
app.use('/api/system', systemRoute);

// Serve static frontend in production
const clientDistPath = path.join(__dirname, '../client/dist');
if (!fs.existsSync(clientDistPath)) {
  console.log('[DevMemory] client/dist not detected. Building client bundle automatically...');
  try {
    const { execSync } = require('child_process');
    execSync('npm --prefix client install && npm --prefix client run build', {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit'
    });
  } catch (err) {
    console.warn('[DevMemory] Automatic client build error:', err.message);
  }
}

if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(clientDistPath, 'index.html'));
    }
  });
} else {
  app.get('/', (req, res) => {
    res.send(`
      <div style="font-family:sans-serif;max-width:600px;margin:50px auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;">
        <h2>DevMemory Server Running</h2>
        <p>The client bundle has not been built yet.</p>
        <p>Run: <code>npm run setup</code> or <code>npm run build</code> in the root directory, then reload this page.</p>
      </div>
    `);
  });
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

start();

process.on('SIGINT', async () => {
  console.log('\nShutting down DevMemory server gracefully...');
  if (dbManager.client) {
    await dbManager.client.close();
  }
  process.exit(0);
});
