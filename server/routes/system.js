const express = require('express');
const router = express.Router();
const dbManager = require('../db');
const memoryRepo = require('../memoryModel');

// System Health & MongoDB Diagnostics
router.get('/health', async (req, res) => {
  try {
    const health = await dbManager.getHealth();
    res.json({ success: true, health });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Trigger Re-seeding via API
router.post('/seed', async (req, res) => {
  try {
    const { runSeed } = require('../seed');
    const inserted = await runSeed();
    res.json({ success: true, message: 'Database seeded successfully', count: inserted.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Settings API (Get / Set LLM API Keys)
router.get('/settings', (req, res) => {
  res.json({
    success: true,
    hasGemini: !!process.env.GEMINI_API_KEY,
    hasOpenAI: !!process.env.OPENAI_API_KEY
  });
});

router.post('/settings', (req, res) => {
  try {
    const { geminiApiKey, openaiApiKey } = req.body;
    const fs = require('fs');
    const path = require('path');
    const envPath = path.join(__dirname, '../../.env');

    if (geminiApiKey !== undefined) {
      process.env.GEMINI_API_KEY = geminiApiKey.trim();
    }
    if (openaiApiKey !== undefined) {
      process.env.OPENAI_API_KEY = openaiApiKey.trim();
    }

    // Persist to .env
    if (fs.existsSync(envPath)) {
      let content = fs.readFileSync(envPath, 'utf8');
      if (geminiApiKey !== undefined) {
        if (content.includes('GEMINI_API_KEY=')) {
          content = content.replace(/GEMINI_API_KEY=.*/, `GEMINI_API_KEY=${geminiApiKey.trim()}`);
        } else {
          content += `\nGEMINI_API_KEY=${geminiApiKey.trim()}`;
        }
      }
      if (openaiApiKey !== undefined) {
        if (content.includes('OPENAI_API_KEY=')) {
          content = content.replace(/OPENAI_API_KEY=.*/, `OPENAI_API_KEY=${openaiApiKey.trim()}`);
        } else {
          content += `\nOPENAI_API_KEY=${openaiApiKey.trim()}`;
        }
      }
      fs.writeFileSync(envPath, content, 'utf8');
    }

    res.json({
      success: true,
      message: 'Settings updated successfully',
      hasGemini: !!process.env.GEMINI_API_KEY,
      hasOpenAI: !!process.env.OPENAI_API_KEY
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Test LLM API Key live with Google / OpenAI
router.post('/test-key', async (req, res) => {
  const { provider, apiKey } = req.body;
  const keyToTest = (apiKey || (provider === 'openai' ? process.env.OPENAI_API_KEY : process.env.GEMINI_API_KEY) || '').trim();

  if (!keyToTest) {
    return res.status(400).json({ success: false, error: 'No API key provided to test' });
  }

  if (provider === 'openai') {
    try {
      const resp = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${keyToTest}` },
        signal: AbortSignal.timeout(5000)
      });
      const data = await resp.json();
      if (resp.ok) {
        return res.json({ success: true, message: 'OpenAI API key is valid and connected!' });
      }
      return res.status(400).json({ success: false, error: data.error?.message || 'OpenAI authentication failed' });
    } catch (e) {
      return res.status(500).json({ success: false, error: `Connection failed: ${e.message}` });
    }
  }

  // Gemini Test
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${keyToTest}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const data = await resp.json();

    if (resp.ok && data.models) {
      return res.json({
        success: true,
        message: 'Google Gemini API key is valid and active!',
        modelCount: data.models.length
      });
    }

    return res.status(400).json({
      success: false,
      error: data.error?.message || 'Gemini authentication failed (Invalid API key)'
    });
  } catch (e) {
    return res.status(500).json({
      success: false,
      error: `Network error reaching Google API: ${e.message}`
    });
  }
});

// Vector Search Index Definition Helper for Atlas UI
router.get('/vector-index-def', (req, res) => {
  const indexDefinition = {
    name: 'vector_index',
    type: 'vectorSearch',
    definition: {
      fields: [
        {
          type: 'vector',
          path: 'embedding',
          numDimensions: 384,
          similarity: 'cosine'
        },
        {
          type: 'filter',
          path: 'workspace'
        },
        {
          type: 'filter',
          path: 'lifecycle.status'
        },
        {
          type: 'filter',
          path: 'type'
        },
        {
          type: 'filter',
          path: 'lifecycle.privacy'
        }
      ]
    }
  };

  res.json({
    success: true,
    indexDefinition,
    instructions: 'In MongoDB Atlas -> Browse Collections -> Atlas Search -> Create Search Index -> JSON Editor -> Paste this definition and name it "vector_index". Note: DevMemory also includes built-in hybrid similarity search so queries work immediately!'
  });
});

module.exports = router;
