const express = require('express');
const router = express.Router();
const memoryRepo = require('../memoryModel');

// List memories with optional filtering
router.get('/', async (req, res) => {
  try {
    const { workspace, status, type, search, limit, skip } = req.query;
    const memories = await memoryRepo.listMemories(
      { workspace, status, type, search },
      { limit: parseInt(limit) || 50, skip: parseInt(skip) || 0 }
    );
    res.json({ success: true, count: memories.length, memories });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Semantic Vector Search endpoint
router.post('/vector-search', async (req, res) => {
  try {
    const { query, workspace, status, types, limit, minScore } = req.body;
    if (!query) {
      return res.status(400).json({ success: false, error: 'Query text is required' });
    }

    const results = await memoryRepo.vectorSearch({
      query,
      workspace: workspace || 'auth-service',
      status: status || 'active',
      types,
      limit: limit || 5,
      minScore: minScore || 0.4
    });

    res.json({ success: true, count: results.length, query, results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get memory by ID (Inspector View)
router.get('/:id', async (req, res) => {
  try {
    const memory = await memoryRepo.getById(req.params.id);
    if (!memory) {
      return res.status(404).json({ success: false, error: 'Memory document not found' });
    }
    res.json({ success: true, memory });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create new memory
router.post('/', async (req, res) => {
  try {
    const created = await memoryRepo.createMemory(req.body);
    res.status(201).json({ success: true, memory: created });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Supersede memory (Conflict Resolution / Constraint Correction)
router.post('/:id/supersede', async (req, res) => {
  try {
    const { newMemoryData, reason } = req.body;
    if (!newMemoryData) {
      return res.status(400).json({ success: false, error: 'newMemoryData is required' });
    }
    const result = await memoryRepo.supersedeMemory(req.params.id, newMemoryData, reason);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create ephemeral memory with TTL
router.post('/ephemeral', async (req, res) => {
  try {
    const { memoryData, ttlSeconds } = req.body;
    const created = await memoryRepo.createEphemeralMemory(memoryData, ttlSeconds || 60);
    res.status(201).json({ success: true, memory: created });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete memory
router.delete('/:id', async (req, res) => {
  try {
    const hard = req.query.hard === 'true';
    await memoryRepo.deleteMemory(req.params.id, hard);
    res.json({ success: true, message: hard ? 'Hard deleted' : 'Marked as invalidated' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
