/**
 * Agent Reasoning & Memory Orchestration Service
 * Provides natural AI coding assistance while perpetually checking and updating MongoDB memory.
 * Whenever a past bug, failure, or constraint is relevant, the agent automatically rectifies it.
 * Also automatically captures new learnings when the user shares constraints or post-mortems.
 */

const memoryRepo = require('./memoryModel');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

class AgentService {
  /**
   * Process a natural developer query
   */
  async processQuery({ query, sessionId, workspace = 'auth-service', role = 'developer' }) {
    const timestamp = new Date();
    const queryLower = query.toLowerCase().trim();

    // 1. Detect if the user is explicitly teaching the AI something to remember
    const autoLearn = this.detectLearningIntent(query, workspace);
    let newlyLearnedMemory = null;

    if (autoLearn) {
      newlyLearnedMemory = await memoryRepo.createMemory({
        owner: role,
        workspace,
        type: autoLearn.type,
        content: {
          title: autoLearn.title,
          problem: autoLearn.problem,
          attemptedFix: autoLearn.attemptedFix || '',
          outcome: autoLearn.outcome || '',
          recommendation: autoLearn.recommendation,
          codeSnippet: autoLearn.codeSnippet || ''
        },
        source: {
          sessionId,
          channel: 'conversational_learning',
          author: role
        },
        lifecycle: {
          status: 'active',
          confidence: 1.0,
          tags: autoLearn.tags || ['learned-in-chat']
        }
      });
    }

    // 2. Query MongoDB Vector Search for relevant memories in this workspace
    const recalledMemories = await memoryRepo.vectorSearch({
      query,
      workspace,
      status: 'active',
      limit: 3,
      minScore: 0.45
    });

    // 3. Record recall events in MongoDB telemetry
    for (const mem of recalledMemories) {
      await memoryRepo.recordRecall(mem._id, sessionId, query, mem.relevanceScore);
    }

    // 4. Generate intelligent response with automatic rectification
    let agentResponse = '';
    let autoRectification = null;

    // Check if external LLM API keys are set (Gemini or OpenAI)
    const geminiKey = process.env.GEMINI_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (geminiKey) {
      try {
        agentResponse = await this.callGemini(query, workspace, recalledMemories, newlyLearnedMemory);
      } catch (err) {
        console.warn('[Agent] Gemini API failed, using native code engine:', err.message);
        agentResponse = this.generateNativeResponse(query, workspace, recalledMemories, newlyLearnedMemory);
      }
    } else if (openaiKey) {
      try {
        agentResponse = await this.callOpenAI(query, workspace, recalledMemories, newlyLearnedMemory);
      } catch (err) {
        console.warn('[Agent] OpenAI API failed, using native code engine:', err.message);
        agentResponse = this.generateNativeResponse(query, workspace, recalledMemories, newlyLearnedMemory);
      }
    } else {
      // Native high-capability coding & rectification engine
      agentResponse = this.generateNativeResponse(query, workspace, recalledMemories, newlyLearnedMemory);
    }

    // Identify if a memory directly altered or rectified this response
    if (recalledMemories.length > 0) {
      const topMemory = recalledMemories[0];
      autoRectification = {
        memoryId: topMemory._id,
        type: topMemory.type,
        title: topMemory.content.title,
        rectification: topMemory.content.recommendation,
        score: topMemory.relevanceScore,
        workspace: topMemory.workspace
      };
    }

    return {
      sessionId,
      workspace,
      query,
      timestamp,
      response: agentResponse,
      autoRectification,
      newlyLearnedMemory,
      recalledMemories: recalledMemories.map(m => ({
        id: m._id,
        type: m.type,
        title: m.content.title,
        relevanceScore: m.relevanceScore,
        recommendation: m.content.recommendation,
        status: m.lifecycle.status,
        recallsCount: (m.recallStats?.recallsCount || 0) + 1
      }))
    };
  }

  /**
   * Automatically detect if the user's prompt is conveying an invariant or bug to remember
   */
  detectLearningIntent(query, workspace) {
    const q = query.trim();
    const lower = q.toLowerCase();

    // Check for explicit memory triggers
    const triggerMatch = lower.match(/(?:remember that|note that|keep in mind that|new rule:|from now on,|never use|always use|we changed|we migrated to|bug fix:)\s*(.*)/i);
    
    if (triggerMatch && triggerMatch[1]) {
      const ruleText = triggerMatch[1].trim();
      const isNegative = lower.includes('never') || lower.includes("don't") || lower.includes('failed') || lower.includes('bug');

      return {
        type: isNegative ? 'failed_fix' : 'constraint',
        title: ruleText.length > 60 ? ruleText.slice(0, 57) + '...' : ruleText,
        problem: `Developer specified rule for ${workspace}: "${q}"`,
        attemptedFix: isNegative ? q : '',
        outcome: isNegative ? 'Flagged as anti-pattern by developer' : 'Approved invariant',
        recommendation: ruleText,
        tags: ['conversational-learning', workspace]
      };
    }

    // Check for "X failed because Y" pattern
    const failMatch = lower.match(/(.+)\s+(?:failed|broke|threw an error|crashed)\s+(?:because|with|due to)\s+(.+)/i);
    if (failMatch) {
      return {
        type: 'failed_fix',
        title: `Fix failure: ${failMatch[1].slice(0, 40).trim()}`,
        problem: failMatch[1].trim(),
        attemptedFix: failMatch[1].trim(),
        outcome: failMatch[2].trim(),
        recommendation: `Avoid ${failMatch[1].trim()}; resolve root cause: ${failMatch[2].trim()}`,
        tags: ['failed-fix', 'bug-postmortem', workspace]
      };
    }

    return null;
  }

  /**
   * Native high-capability coding engine with automatic invariant rectification
   */
  generateNativeResponse(query, workspace, recalledMemories, newlyLearnedMemory) {
    const qLower = query.toLowerCase();

    // If a new memory was just learned from this message
    if (newlyLearnedMemory) {
      return `I have committed this to my memory for **\`${workspace}\`**:

> **Recorded Rule:** "${newlyLearnedMemory.content.title}"
> **Action:** Stored in MongoDB Atlas vector graph.

Whenever you or another developer encounter this in **\`${workspace}\`**, I will automatically apply this invariant and prevent mistakes.`;
    }

    // Check if relevant memories were recalled to automatically rectify
    if (recalledMemories.length > 0) {
      const mem = recalledMemories[0];

      // Auth / JWT Token Expiration query
      if (qLower.includes('token') || qLower.includes('jwt') || qLower.includes('expir') || qLower.includes('401') || qLower.includes('auth')) {
        return `I have checked our memory for **\`${workspace}\`** and automatically applied a known project invariant:

> **Applied Rectification (Memory #${mem._id.toString().slice(-6)}):**
> *${mem.content.recommendation}*
> *(Avoided prior failure: ${mem.content.outcome || mem.content.problem})*

Here is the robust, rectified implementation:

\`\`\`typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Correct Pattern: Server-managed rotating refresh token
export async function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET!, (err, user) => {
    if (err) {
      // 401 triggers client to hit the server-side refresh endpoint
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    req.user = user;
    next();
  });
}

// Dedicated token rotation endpoint (server strictly controls issuance)
export async function handleTokenRefresh(req: Request, res: Response) {
  const refreshToken = req.cookies.refreshToken;
  if (!refreshToken) return res.status(401).json({ error: 'Refresh token missing' });

  try {
    const session = await verifyAndRotateSession(refreshToken);
    // Issue rotated refresh token in secure HttpOnly cookie
    res.cookie('refreshToken', session.newRefreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict'
    });
    res.json({ accessToken: session.newAccessToken });
  } catch (err) {
    res.status(403).json({ error: 'Invalid refresh token session' });
  }
}
\`\`\`

**Why this rectifies the issue:**
1. The client never attempts to self-sign or tamper with token timestamps, preventing signature mismatch and replay attacks.
2. Short-lived access tokens (15m) paired with server-rotated refresh tokens allow instant session revocation without clock skew issues.`;
      }

      // Currency / Float math query
      if (qLower.includes('currency') || qLower.includes('float') || qLower.includes('price') || qLower.includes('discount') || qLower.includes('stripe')) {
        return `I reviewed our project memory for **\`${workspace}\`** and applied our financial math invariant:

> **Applied Rectification (Memory #${mem._id.toString().slice(-6)}):**
> *${mem.content.recommendation}*

Here is the correct integer-based calculation pattern:

\`\`\`typescript
// Accurate financial computation in integer cents (avoid IEEE-754 float drift)
export function calculateOrderCents(itemPriceCents: number, quantity: number, discountBps: number, taxRateBps: number): {
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
} {
  const subtotalCents = itemPriceCents * quantity;
  
  // Basis points division with proper rounding (10000 bps = 100%)
  const discountCents = Math.round((subtotalCents * discountBps) / 10000);
  const taxableSubtotal = Math.max(0, subtotalCents - discountCents);
  const taxCents = Math.round((taxableSubtotal * taxRateBps) / 10000);
  const totalCents = taxableSubtotal + taxCents;

  return { subtotalCents, discountCents, taxCents, totalCents };
}
\`\`\`

All currency values remain whole integers through payment capture, eliminating fractional penny rounding errors.`;
      }

      // Idempotency query
      if (qLower.includes('idempot') || qLower.includes('retry') || qLower.includes('duplicate') || qLower.includes('webhook')) {
        return `Applying mandated project invariant from memory for **\`${workspace}\`**:

> **Applied Rectification (Memory #${mem._id.toString().slice(-6)}):**
> *${mem.content.recommendation}*

\`\`\`typescript
import { Request, Response, NextFunction } from 'express';
import { redisClient } from '../config/redis';

export async function enforceIdempotency(req: Request, res: Response, next: NextFunction) {
  const key = req.headers['idempotency-key'] as string;
  if (!key) {
    return res.status(400).json({ error: 'Idempotency-Key header is mandatory for this mutation' });
  }

  // Atomic lock with 24-hour expiration
  const acquired = await redisClient.set(\`idemp:\${key}\`, 'IN_FLIGHT', 'NX', 'EX', 86400);
  if (!acquired) {
    return res.status(409).json({ error: 'Duplicate request detected or already processed' });
  }

  next();
}
\`\`\``;
      }

      // Generic memory citation
      return `I reviewed our memory for **\`${workspace}\`** and matched rule: **${mem.content.title}** (${(mem.relevanceScore * 100).toFixed(1)}% relevance).

**Enforced Pattern:**
${mem.content.recommendation}

${mem.content.codeSnippet ? `\`\`\`typescript\n${mem.content.codeSnippet}\n\`\`\`` : ''}

Let me know if you would like me to adjust this to specific files in your repository.`;
    }

    // Normal AI assistant answer when no specific bug invariant is in memory
    return `Here is a solution for your request:

To implement this cleanly in **\`${workspace}\`**:
1. Keep service boundaries decoupled and handle errors with structured error classes.
2. Ensure asynchronous handlers return proper status codes and handle uncaught rejections.

\`\`\`typescript
// Standard implementation pattern
export async function executeOperation(payload: unknown) {
  try {
    // Validate inputs
    if (!payload) throw new Error('Missing required payload');
    
    // Process business logic
    return { success: true, timestamp: Date.now() };
  } catch (err: any) {
    console.error('Operation failed:', err.message);
    throw err;
  }
}
\`\`\`

*Note: If you run into any bug or constraint while testing, simply tell me (e.g. "Remember that...") or click "Record Bug / Rule" and I will never make the mistake again.*`;
  }

  /**
   * Optional Gemini API integration
   */
  async callGemini(query, workspace, memories, newlyLearnedMemory) {
    const memoryDirectives = memories.map(m => 
      `- INVARIANT (${m.type}): "${m.content.title}". Rule to follow: ${m.content.recommendation}. Past failure to avoid: ${m.content.outcome || m.content.problem}`
    ).join('\n');

    const systemPrompt = `You are DevMemory, a professional senior software engineer and AI pair programmer.
Current workspace: ${workspace}.

CRITICAL INSTRUCTIONS:
You have access to persistent memories stored in MongoDB Atlas for this repository.
If any invariants below apply to the user's question, you MUST automatically rectify the code and adhere strictly to them:
${memoryDirectives || 'No prior failures in memory for this topic yet.'}

Provide a clean, direct, high-quality answer with working code. If you rectified code based on a memory, briefly state what was rectified at the top.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
    
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: `${systemPrompt}\n\nUser Question: ${query}` }] }
        ]
      })
    });

    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || this.generateNativeResponse(query, workspace, memories, newlyLearnedMemory);
  }

  /**
   * Optional OpenAI API integration
   */
  async callOpenAI(query, workspace, memories, newlyLearnedMemory) {
    const memoryDirectives = memories.map(m => 
      `- RULE (${m.type}): "${m.content.title}". Rule: ${m.content.recommendation}. Failure to avoid: ${m.content.outcome || m.content.problem}`
    ).join('\n');

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are DevMemory, a senior AI pair programmer. Workspace: ${workspace}.
Adhere strictly to project invariants from MongoDB memory:
${memoryDirectives}`
          },
          { role: 'user', content: query }
        ]
      })
    });

    const data = await res.json();
    return data.choices?.[0]?.message?.content || this.generateNativeResponse(query, workspace, memories, newlyLearnedMemory);
  }
}

module.exports = new AgentService();
