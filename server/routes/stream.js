const express = require('express');
const router = express.Router();
const dbManager = require('../db');

// Set of active SSE client responses
const clients = new Set();

// Listen to dbManager change stream events
dbManager.on('memory_change', (event) => {
  const payload = JSON.stringify(event);
  clients.forEach(client => {
    try {
      client.write(`event: memory_change\ndata: ${payload}\n\n`);
    } catch (err) {
      clients.delete(client);
    }
  });
});

// SSE endpoint
router.get('/', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  res.write(': connected to DevMemory Change Stream\n\n');
  clients.add(res);

  // Send initial keepalive ping
  const intervalId = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch (err) {
      clearInterval(intervalId);
      clients.delete(res);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(intervalId);
    clients.delete(res);
  });
});

// Broadcast manual notification event
function broadcastCustomEvent(eventType, data) {
  const payload = JSON.stringify(data);
  clients.forEach(client => {
    try {
      client.write(`event: ${eventType}\ndata: ${payload}\n\n`);
    } catch (err) {
      clients.delete(client);
    }
  });
}

module.exports = {
  router,
  broadcastCustomEvent
};
