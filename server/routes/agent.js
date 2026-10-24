const express = require('express');
const router = express.Router();
const agentService = require('../agentService');

// Interactive Agent Chat
router.post('/chat', async (req, res) => {
  try {
    const { query, history, sessionId, workspace, role } = req.body;
    if (!query) {
      return res.status(400).json({ success: false, error: 'Query is required' });
    }

    const result = await agentService.processQuery({
      query,
      history: history || [],
      sessionId: sessionId || 'session-' + Date.now(),
      workspace: workspace || 'auth-service',
      role: role || 'developer'
    });

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Act 1 Demo Endpoint: Simulate Mistake & Record
router.post('/simulate-mistake', async (req, res) => {
  try {
    const { workspace, sessionId } = req.body;
    const result = await agentService.simulateMistake({ workspace, sessionId });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Act 4 Demo Endpoint: Architecture Correction & Superseding
router.post('/simulate-correction', async (req, res) => {
  try {
    const { newConstraint } = req.body;
    const result = await agentService.simulateCorrection({ newConstraint });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Act 4 Demo Endpoint: Ephemeral TTL Memory
router.post('/simulate-ephemeral', async (req, res) => {
  try {
    const { workspace, ttlSeconds } = req.body;
    const result = await agentService.simulateEphemeral({
      workspace: workspace || 'auth-service',
      ttlSeconds: parseInt(ttlSeconds) || 30
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
