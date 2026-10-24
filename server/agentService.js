/**
 * Agent Reasoning & Memory Orchestration Service
 * Handles conversational queries naturally, supports external LLM APIs (Gemini / OpenAI),
 * and provides rich domain-specific code intelligence with automatic MongoDB invariant rectification.
 */

const memoryRepo = require('./memoryModel');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

class AgentService {
  /**
   * Process a natural developer query
   */
  async processQuery({ query, sessionId, workspace = 'auth-service', role = 'developer' }) {
    const timestamp = new Date();
    const queryTrimmed = (query || '').trim();
    const queryLower = queryTrimmed.toLowerCase();

    // 1. Detect if the user is explicitly teaching the AI something to remember
    const autoLearn = this.detectLearningIntent(queryTrimmed, workspace);
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
    // (Only query vector search if it's not a simple greeting)
    const isGreeting = this.isSimpleGreeting(queryLower);
    let recalledMemories = [];

    if (!isGreeting && !newlyLearnedMemory) {
      recalledMemories = await memoryRepo.vectorSearch({
        query: queryTrimmed,
        workspace,
        status: 'active',
        limit: 3,
        minScore: 0.48
      });

      for (const mem of recalledMemories) {
        await memoryRepo.recordRecall(mem._id, sessionId, queryTrimmed, mem.relevanceScore);
      }
    }

    // 3. Generate response
    let agentResponse = '';
    let autoRectification = null;

    // Check external LLM keys
    const geminiKey = process.env.GEMINI_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (geminiKey) {
      try {
        agentResponse = await this.callGemini(queryTrimmed, workspace, recalledMemories, newlyLearnedMemory);
      } catch (err) {
        console.warn('[Agent] Gemini API error, falling back to local reasoning:', err.message);
        agentResponse = await this.generateIntelligentResponse(queryTrimmed, workspace, recalledMemories, newlyLearnedMemory);
      }
    } else if (openaiKey) {
      try {
        agentResponse = await this.callOpenAI(queryTrimmed, workspace, recalledMemories, newlyLearnedMemory);
      } catch (err) {
        console.warn('[Agent] OpenAI API error, falling back to local reasoning:', err.message);
        agentResponse = await this.generateIntelligentResponse(queryTrimmed, workspace, recalledMemories, newlyLearnedMemory);
      }
    } else {
      agentResponse = await this.generateIntelligentResponse(queryTrimmed, workspace, recalledMemories, newlyLearnedMemory);
    }

    // Check if an invariant altered or rectified this response
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
      query: queryTrimmed,
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
   * Check if the input is a simple greeting
   */
  isSimpleGreeting(text) {
    const cleaned = text.replace(/[!?,.]/g, '').trim();
    const greetingWords = [
      'hi', 'hello', 'hey', 'hi hello', 'hello hi', 'good morning', 
      'good afternoon', 'good evening', 'hey there', 'hi there', 
      'greetings', 'yo', 'sup', 'howdy'
    ];
    return greetingWords.includes(cleaned) || /^(hi|hello|hey|yo)\b/i.test(cleaned) && cleaned.split(' ').length <= 3;
  }

  /**
   * Automatically detect if the user is conveying an invariant or bug to remember
   */
  detectLearningIntent(query, workspace) {
    const q = query.trim();
    const lower = q.toLowerCase();

    const triggerMatch = lower.match(/(?:remember that|note that|keep in mind that|new rule:|from now on,|never use|always use|we migrated to|bug fix:)\s*(.*)/i);
    if (triggerMatch && triggerMatch[1]) {
      const ruleText = triggerMatch[1].trim();
      const isNegative = lower.includes('never') || lower.includes("don't") || lower.includes('failed') || lower.includes('bug');

      return {
        type: isNegative ? 'failed_fix' : 'constraint',
        title: ruleText.length > 60 ? ruleText.slice(0, 57) + '...' : ruleText,
        problem: `Project invariant in ${workspace}: "${q}"`,
        attemptedFix: isNegative ? q : '',
        outcome: isNegative ? 'Anti-pattern marked by developer' : 'Approved invariant',
        recommendation: ruleText,
        tags: ['conversational-learning', workspace]
      };
    }

    const failMatch = lower.match(/(.+)\s+(?:failed|broke|threw an error|crashed)\s+(?:because|with|due to)\s+(.+)/i);
    if (failMatch) {
      return {
        type: 'failed_fix',
        title: `Failure: ${failMatch[1].slice(0, 40).trim()}`,
        problem: failMatch[1].trim(),
        attemptedFix: failMatch[1].trim(),
        outcome: failMatch[2].trim(),
        recommendation: `Avoid ${failMatch[1].trim()}; resolve cause: ${failMatch[2].trim()}`,
        tags: ['failed-fix', 'bug-postmortem', workspace]
      };
    }

    return null;
  }

  /**
   * Intelligent local conversational and coding engine
   */
  async generateIntelligentResponse(query, workspace, recalledMemories, newlyLearnedMemory) {
    const qLower = query.toLowerCase().trim();

    // 1. Newly learned memory confirmation
    if (newlyLearnedMemory) {
      return `I have saved this invariant to my memory for **\`${workspace}\`**:

> **Rule:** "${newlyLearnedMemory.content.title}"
> **Persistence:** Indexed in MongoDB Atlas vector graph.

Whenever this issue or context is encountered again, I will automatically rectify the code and adhere to this rule.`;
    }

    // 2. Greetings and pleasantries
    if (this.isSimpleGreeting(qLower)) {
      const activeCount = await memoryRepo.listMemories({ workspace, status: 'active' });
      return `Hello! I am **DevMemory**, your AI coding assistant for **\`${workspace}\`**.

I currently have **${activeCount.length} active memory invariants** indexed in MongoDB for this workspace.

Here is what I can do for you:
- **Write and review code** across TypeScript, Python, Go, SQL, React, and Node.js
- **Debug errors and explain architectures**
- **Persist learnings**: Whenever a bug fix fails or a constraint changes, tell me *"Remember that..."* and I will never repeat that mistake.
- **Auto-rectify**: If an issue touches a prior failure (e.g. token expiration, floating-point math, idempotency), I will automatically write the rectified, verified solution.

What would you like to work on?`;
    }

    // 3. Identity and Help questions
    if (qLower.includes('who are you') || qLower === 'help' || qLower.includes('what can you do') || qLower.includes('how do you work')) {
      return `### About DevMemory

I am a persistent AI pair programmer connected to **MongoDB Atlas**. Unlike traditional stateless assistants that forget previous interactions, I retain a memory graph of:
1. **Past Failed Fixes:** Solutions that failed integration tests or security audits so I never suggest them again.
2. **Project Constraints:** Architectural invariants (e.g., Redis session sliding TTL, mandatory idempotency keys).
3. **Team Conventions:** Cryptographic parameters, coding standards, and error handling policies.

**How to teach me:**
- Simply type in chat: \`"Remember that [rule or bug]"\`
- Or click **Teach Bug / Rule** in the top bar.

Whenever a coding task or question matches a prior memory, I automatically apply the rectification directly into the code.`;
    }

    // 4. "What do you remember?" / "Show memories"
    if (qLower.includes('what do you remember') || qLower.includes('list memories') || qLower.includes('show rules')) {
      const allMemories = await memoryRepo.listMemories({ workspace, status: 'active' });
      if (allMemories.length === 0) {
        return `I currently have no active memories stored for workspace **\`${workspace}\`**. You can teach me one by typing *"Remember that..."* or using the **Teach Bug / Rule** button!`;
      }
      const list = allMemories.map((m, i) => `${i + 1}. **[${m.type.toUpperCase()}]** ${m.content.title} *(Recalled ${m.recallStats?.recallsCount || 0}x)*\n   *Rectification:* ${m.content.recommendation}`).join('\n\n');
      return `### Persistent Invariants for \`${workspace}\`:\n\n${list}\n\n*All of these are indexed in MongoDB Atlas and will automatically rectify future code generation.*`;
    }

    // 5. Automatic Rectification on Recalled Memories
    if (recalledMemories.length > 0) {
      const mem = recalledMemories[0];

      // Auth / JWT Token Expiration query
      if (qLower.includes('token') || qLower.includes('jwt') || qLower.includes('expir') || qLower.includes('401') || qLower.includes('auth')) {
        return `I checked our memory for **\`${workspace}\`** and automatically applied a known project invariant:

> **Auto-Rectified from Memory (#${mem._id.toString().slice(-6)}):**
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
      if (qLower.includes('currency') || qLower.includes('float') || qLower.includes('price') || qLower.includes('discount') || qLower.includes('stripe') || qLower.includes('cent')) {
        return `I reviewed our project memory for **\`${workspace}\`** and applied our financial math invariant:

> **Auto-Rectified from Memory (#${mem._id.toString().slice(-6)}):**
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

> **Auto-Rectified from Memory (#${mem._id.toString().slice(-6)}):**
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

      // Password hashing
      if (qLower.includes('password') || qLower.includes('hash') || qLower.includes('argon') || qLower.includes('bcrypt')) {
        return `Applying verified password security convention from memory:

> **Applied Invariant (Memory #${mem._id.toString().slice(-6)}):**
> *${mem.content.recommendation}*

\`\`\`typescript
import argon2 from 'argon2';

export async function hashPassword(plainText: string): Promise<string> {
  return argon2.hash(plainText, {
    type: argon2.argon2id,
    memoryCost: 65536, // 64MB memory hardness
    timeCost: 3,
    parallelism: 4
  });
}

export async function verifyPassword(hash: string, plainText: string): Promise<boolean> {
  return argon2.verify(hash, plainText);
}
\`\`\``;
      }

      // Generic memory citation
      return `I checked our memory for **\`${workspace}\`** and matched invariant: **${mem.content.title}** (${(mem.relevanceScore * 100).toFixed(1)}% match).

**Mandated Rule:**
${mem.content.recommendation}

${mem.content.codeSnippet ? `\`\`\`typescript\n${mem.content.codeSnippet}\n\`\`\`` : ''}`;
    }

    // 6. Conversational / Conceptual Tech Questions
    if (qLower.includes('jwt vs session') || qLower.includes('difference between jwt and session')) {
      return `### JWT vs. Server-Side Sessions

**1. Stateless JWT (JSON Web Tokens):**
- **How it works:** User data is cryptographically signed and stored on the client. The server verifies signature without database lookups.
- **Pros:** Highly scalable across microservices; zero server memory usage.
- **Cons:** Cannot easily be invalidated before expiration without a blacklist; payload size overhead on every request.

**2. Stateful Sessions (e.g. Redis / MongoDB):**
- **How it works:** Server generates an opaque random session ID, stores the session object in Redis/DB, and gives client an HttpOnly cookie.
- **Pros:** Instant revocation (logout invalidates immediately); sensitive user state is never exposed to client.
- **Cons:** Requires shared session store (Redis) across server instances.

**Hybrid Best Practice:** Short-lived JWT access tokens (15m) paired with server-stored rotating refresh tokens in HttpOnly cookies.`;
    }

    if (qLower.includes('what is cors') || qLower.includes('cors error')) {
      return `### Understanding CORS (Cross-Origin Resource Sharing)

CORS is a browser security mechanism that restricts web applications from making HTTP requests to a domain different from the one that served the web page.

**Common Fix in Express:**
\`\`\`typescript
import cors from 'cors';

app.use(cors({
  origin: ['http://localhost:5173', 'https://yourdomain.com'],
  credentials: true, // Allow cookies and auth headers
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));
\`\`\`

If your requests use cookies or \`Authorization\` headers, ensure \`credentials: true\` is set on both server and client fetch (\`credentials: 'include'\`).`;
    }

    // 7. Simple Math & Expressions
    if (/^[\d\s+\-*/().%^]+$/.test(qLower) && /\d/.test(qLower)) {
      try {
        const sanitized = qLower.replace(/[^-()\d/*+.]/g, '');
        const result = Function(`'use strict'; return (${sanitized})`)();
        return `${query} = **${result}**`;
      } catch (e) {}
    }

    // 8. Generic Code Generation requests
    if (qLower.includes('email') && (qLower.includes('validate') || qLower.includes('regex'))) {
      return `Here is a reliable email validation utility:

\`\`\`typescript
// Standard RFC 5322 compliant email regex
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_\`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export function isValidEmail(email: string): boolean {
  if (!email || email.length > 254) return false;
  return EMAIL_REGEX.test(email.trim());
}
\`\`\`

Feel free to ask if you would like integration with Zod, Yup, or Joi schema validation!`;
    }

    if (qLower.includes('debounce')) {
      return `Here is a TypeScript debounce utility:

\`\`\`typescript
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  waitMs: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return function (this: any, ...args: Parameters<T>) {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn.apply(this, args);
    }, waitMs);
  };
}
\`\`\``;
    }

    // 8. Default Natural Response
    return `I can help with that. Could you share a few more details about what you want to implement in **\`${workspace}\`**?

For example:
- Are you creating a new API endpoint, database model, or middleware?
- Do you have an existing code snippet or error message to troubleshoot?

*(Tip: If there are specific project rules or failures you want me to permanently keep in mind, just tell me "Remember that [rule]" and I'll index it into MongoDB Atlas.)*`;
  }

  /**
   * Gemini API integration
   */
  async callGemini(query, workspace, memories, newlyLearnedMemory) {
    const memoryDirectives = memories.map(m => 
      `- INVARIANT (${m.type}): "${m.content.title}". Mandated Rule: ${m.content.recommendation}. Past Failure to Avoid: ${m.content.outcome || m.content.problem}`
    ).join('\n');

    const systemPrompt = `You are DevMemory, a professional senior software engineer and AI pair programmer.
Current workspace: ${workspace}.

CRITICAL INSTRUCTIONS:
You have access to persistent memories stored in MongoDB Atlas for this repository.
If any invariants below apply to the user's question, you MUST automatically rectify the code and adhere strictly to them:
${memoryDirectives || 'No prior failures in memory for this topic yet.'}

Be helpful, concise, conversational, and provide clean working code when requested. If it is a greeting or general question, answer naturally without dumping unrelated code.`;

    const models = [
      'gemini-3.5-flash-lite',
      'gemini-3.5-flash',
      'gemini-flash-latest',
      'gemini-3.8-flash'
    ];

    for (const model of models) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
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
        const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (candidateText) {
          return candidateText;
        }

        if (data.error) {
          console.warn(`[Gemini] Model ${model} returned error:`, data.error.message);
        }
      } catch (err) {
        console.warn(`[Gemini] Model ${model} fetch failed:`, err.message);
      }
    }

    return this.generateIntelligentResponse(query, workspace, memories, newlyLearnedMemory);
  }

  /**
   * OpenAI API integration
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
    return data.choices?.[0]?.message?.content || this.generateIntelligentResponse(query, workspace, memories, newlyLearnedMemory);
  }
}

module.exports = new AgentService();
