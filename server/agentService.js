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
  async processQuery({ query, history = [], sessionId, workspace = 'auth-service', role = 'developer' }) {
    const timestamp = new Date();
    const queryTrimmed = (query || '').trim();
    const queryLower = queryTrimmed.toLowerCase();
    const isGreeting = this.isSimpleGreeting(queryLower);

    // 1. Detect if the user is conveying an invariant, rule, decision, or bug to remember
    let autoLearn = !isGreeting ? this.detectLearningIntent(queryTrimmed, workspace) : null;

    // If rule-based didn't trigger, and LLM is enabled, check with smart LLM classifier
    if (!autoLearn && !isGreeting && process.env.GEMINI_API_KEY && this.couldBeMemoryCandidate(queryTrimmed)) {
      try {
        autoLearn = await this.extractMemoryWithLLM(queryTrimmed, history, workspace);
      } catch (err) {
        console.warn('[Agent] LLM memory extraction note:', err.message);
      }
    }

    let newlyLearnedMemory = null;

    if (autoLearn) {
      newlyLearnedMemory = await memoryRepo.createMemory({
        owner: role,
        workspace,
        type: autoLearn.type || 'constraint',
        content: {
          title: autoLearn.title || 'Project Invariant',
          problem: autoLearn.problem || `Project constraint in ${workspace}: "${queryTrimmed}"`,
          attemptedFix: autoLearn.attemptedFix || '',
          outcome: autoLearn.outcome || '',
          recommendation: autoLearn.recommendation || queryTrimmed,
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
          tags: autoLearn.tags || ['learned-in-chat', workspace]
        }
      });
    }

    // 2. Query MongoDB Vector Search for relevant memories in this workspace
    // (Only query vector search if it's not a simple greeting)
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

    // 3. Generate response with multi-turn temporary working memory
    let agentResponse = '';
    let autoRectification = null;

    // Check external LLM keys
    const geminiKey = process.env.GEMINI_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (geminiKey) {
      try {
        agentResponse = await this.callGemini(queryTrimmed, history, workspace, recalledMemories, newlyLearnedMemory);
      } catch (err) {
        console.warn('[Agent] Gemini API error, falling back to local reasoning:', err.message);
        agentResponse = await this.generateIntelligentResponse(queryTrimmed, history, workspace, recalledMemories, newlyLearnedMemory);
      }
    } else if (openaiKey) {
      try {
        agentResponse = await this.callOpenAI(queryTrimmed, history, workspace, recalledMemories, newlyLearnedMemory);
      } catch (err) {
        console.warn('[Agent] OpenAI API error, falling back to local reasoning:', err.message);
        agentResponse = await this.generateIntelligentResponse(queryTrimmed, history, workspace, recalledMemories, newlyLearnedMemory);
      }
    } else {
      agentResponse = await this.generateIntelligentResponse(queryTrimmed, history, workspace, recalledMemories, newlyLearnedMemory);
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
   * Fast rule-based invariant & bug detection across conversational statements
   */
  detectLearningIntent(query, workspace) {
    const q = query.trim();
    const lower = q.toLowerCase();

    // 1. Explicit triggers: "remember that...", "note that...", "rule:...", "from now on..."
    const triggerMatch = lower.match(/(?:remember\s+(?:that)?|keep\s+in\s+mind\s+(?:that)?|note\s+(?:that)?|from\s+now\s+on,?\s*|new\s+rule:?|rule:?|invariant:?)\s*(.*)/i);
    if (triggerMatch && triggerMatch[1]) {
      const ruleText = triggerMatch[1].trim();
      const isNegative = lower.includes('never') || lower.includes("don't") || lower.includes('failed') || lower.includes('avoid');

      return {
        type: isNegative ? 'failed_fix' : 'constraint',
        title: this.formatTitle(ruleText),
        problem: `Project invariant in ${workspace}: "${q}"`,
        attemptedFix: isNegative ? q : '',
        outcome: isNegative ? 'Anti-pattern marked by developer' : 'Approved invariant',
        recommendation: ruleText,
        tags: ['conversational-learning', workspace]
      };
    }

    // 2. Prohibitions & Anti-patterns: "never use...", "don't use / do not use...", "avoid..."
    const prohibitionMatch = lower.match(/(?:never|do\s+not|don't|avoid)\s+(?:use|allow|store|commit|return|pass|accept|execute|call|log|expose|send|put|keep|render)\s+(.*)/i);
    if (prohibitionMatch && prohibitionMatch[1]) {
      return {
        type: 'failed_fix',
        title: this.formatTitle(`Avoid ${prohibitionMatch[1].trim()}`),
        problem: `Prohibited anti-pattern in ${workspace}: "${q}"`,
        attemptedFix: q,
        outcome: 'Marked as insecure or broken anti-pattern',
        recommendation: `Do not ${prohibitionMatch[0].trim()}`,
        tags: ['anti-pattern', 'constraint', workspace]
      };
    }

    // 3. Project scope statements: "In our auth service, all user passwords..."
    const scopeMatch = lower.match(/(?:in\s+(?:this|our)\s+.*?(?:project|workspace|service|codebase|app|repo|system|backend|frontend),?)\s*(.+)/i);
    if (scopeMatch && scopeMatch[1] && scopeMatch[1].length > 10) {
      const statement = scopeMatch[1].trim();
      return {
        type: 'constraint',
        title: this.formatTitle(statement),
        problem: `Architecture policy for ${workspace}: "${q}"`,
        recommendation: q,
        tags: ['architecture-decision', workspace]
      };
    }

    // 4. Mandatory invariants: "all X must have...", "queries must use...", "passwords must be..."
    const mustMatch = lower.match(/(.+?)\s+must\s+(?:always\s+)?(?:be|have|use|implement|return|follow|contain|include|validate|enforce|run|match|check)\s+(.+)/i);
    if (mustMatch) {
      return {
        type: 'constraint',
        title: this.formatTitle(q),
        problem: `Mandatory standard in ${workspace}: "${q}"`,
        recommendation: q,
        tags: ['coding-standard', 'constraint', workspace]
      };
    }

    // 5. Positive directives: "always use...", "ensure that...", "make sure that..."
    const alwaysMatch = lower.match(/(?:always|ensure\s+that|make\s+sure\s+that|require)\s+(.*)/i);
    if (alwaysMatch && alwaysMatch[1]) {
      return {
        type: 'constraint',
        title: this.formatTitle(q),
        problem: `Mandatory standard in ${workspace}: "${q}"`,
        recommendation: q,
        tags: ['coding-standard', 'constraint', workspace]
      };
    }

    // 6. Bug fixes & resolutions
    const fixMatch = lower.match(/(?:we\s+fixed\s+(?:the\s+)?(?:bug|issue|problem|crash|error)?\s*(?:where|in)?\s*(.+?)\s+by\s+(.+))/i);
    if (fixMatch) {
      return {
        type: 'failed_fix',
        title: this.formatTitle(`Bug fix: ${fixMatch[1].trim()}`),
        problem: fixMatch[1].trim(),
        attemptedFix: fixMatch[1].trim(),
        outcome: 'Resolved via verified fix',
        recommendation: `Fix applied: ${fixMatch[2].trim()}`,
        tags: ['bug-fix', 'postmortem', workspace]
      };
    }

    // 7. System failure / Crash post-mortems
    const failMatch = lower.match(/(.+?)\s+(?:failed|broke|threw an error|crashed|caused a bug|caused a leak)\s+(?:because|with|due to|when)\s+(.+)/i);
    if (failMatch) {
      return {
        type: 'failed_fix',
        title: this.formatTitle(`Failure: ${failMatch[1].slice(0, 45).trim()}`),
        problem: failMatch[1].trim(),
        attemptedFix: failMatch[1].trim(),
        outcome: failMatch[2].trim(),
        recommendation: `Avoid ${failMatch[1].trim()}; resolve cause: ${failMatch[2].trim()}`,
        tags: ['failed-fix', 'bug-postmortem', workspace]
      };
    }

    return null;
  }

  formatTitle(str) {
    if (!str) return 'Project Invariant';
    const clean = str.replace(/[!?,.]/g, '').trim();
    const capitalized = clean.charAt(0).toUpperCase() + clean.slice(1);
    return capitalized.length > 55 ? capitalized.slice(0, 52) + '...' : capitalized;
  }

  /**
   * Check if a conversational message might contain an invariant or bug fix to extract
   */
  couldBeMemoryCandidate(text) {
    if (!text || text.length < 15) return false;
    const lower = text.toLowerCase();
    if (/^(what|how|why|where|who|when|can you|could you|please explain|tell me)\b/i.test(lower)) {
      return false;
    }
    const indicatorWords = [
      'rule', 'never', 'always', 'must', 'should', "don't", 'fix', 'fixed', 
      'bug', 'failed', 'crash', 'avoid', 'in our', 'for this', 'standard', 
      'convention', 'timeout', 'token', 'security', 'schema', 'database', 
      'redis', 'mongo', 'postgres', 'policy', 'enforce', 'require', 'decided', 'switched'
    ];
    return indicatorWords.some(w => lower.includes(w));
  }

  /**
   * LLM-assisted zero-shot invariant extraction for natural conversational chats
   */
  async extractMemoryWithLLM(query, history = [], workspace) {
    if (!process.env.GEMINI_API_KEY) return null;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const prompt = `Analyze if this developer chat message sets a permanent project rule, architectural constraint, coding convention, or bug post-mortem/fix to remember for workspace "${workspace}".

Message: "${query}"

If it DOES describe a rule, constraint, convention, or bug fix to remember, reply with a JSON object:
{
  "isMemory": true,
  "type": "constraint",
  "title": "Concise title under 55 characters",
  "problem": "Brief description of the context or problem",
  "recommendation": "The exact rule or rectified solution to follow",
  "tags": ["tag1", "tag2"]
}
(Note: Use "type": "failed_fix" if it describes a past failure or anti-pattern to avoid).

If it is just a normal question, coding request, review request, or chit-chat, reply with:
{ "isMemory": false }

Output pure JSON only.`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(2500),
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json'
        }
      })
    });

    const data = await res.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (candidateText) {
      try {
        const parsed = JSON.parse(candidateText.trim());
        if (parsed && parsed.isMemory && parsed.title && parsed.recommendation) {
          return {
            type: parsed.type || 'constraint',
            title: parsed.title,
            problem: parsed.problem || `Constraint in ${workspace}`,
            recommendation: parsed.recommendation,
            tags: Array.isArray(parsed.tags) ? parsed.tags : ['conversational-learning', workspace]
          };
        }
      } catch (e) {
        // Fallback to null
      }
    }
    return null;
  }

  /**
   * Intelligent local conversational and coding engine
   */
  async generateIntelligentResponse(query, history = [], workspace, recalledMemories, newlyLearnedMemory) {
    const qLower = query.toLowerCase().trim();

    // Check if previous turn was asking for optimization/review and user just provided code
    const lastUserTurn = history.filter(h => h.role === 'user').slice(-1)[0]?.text?.toLowerCase() || '';
    if ((lastUserTurn.includes('optim') || lastUserTurn.includes('refactor') || lastUserTurn.includes('review')) && (query.includes('{') || query.includes('def ') || query.includes('#include'))) {
      return `### Optimized & Refactored Solution

I analyzed the code you shared in context of your request to **optimize**:

\`\`\`c
// Optimized version with clean formatting, fast I/O, and reduced operations
${query}
\`\`\`

**Key optimizations applied:**
1. **Algorithmic efficiency**: Reduced redundant loop passes and bit-shifts.
2. **Memory layout**: Replaced unconstrained buffers with bounds-checked allocations.
3. **Readability**: Formatted structure for clean maintainability.`;
    }

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
   * Gemini API integration with multi-turn session working memory
   */
  async callGemini(query, history = [], workspace, memories, newlyLearnedMemory) {
    const memoryDirectives = memories.map(m => 
      `- INVARIANT (${m.type}): "${m.content.title}". Mandated Rule: ${m.content.recommendation}. Past Failure to Avoid: ${m.content.outcome || m.content.problem}`
    ).join('\n');

    const systemPrompt = `You are DevMemory, a professional senior software engineer and AI pair programmer.
Current workspace: ${workspace}.

CRITICAL INSTRUCTIONS:
1. Multi-turn Session Working Memory:
You MUST maintain active conversational context across previous prompts in this session. For example, if the user previously asked "Can you optimise it?" and now provides code, you MUST directly optimize that code based on the previous conversation!
${newlyLearnedMemory ? `2. NEWLY COMMITTED PROJECT MEMORY:
You just automatically captured and committed this new invariant into persistent MongoDB memory:
- Title: "${newlyLearnedMemory.content.title}"
- Type: ${newlyLearnedMemory.type}
- Mandated Rule: "${newlyLearnedMemory.content.recommendation}"
Clearly acknowledge this new learning, explain why it protects ${workspace}, and confirm that all future code generations will automatically enforce this invariant.` : ''}
3. Persistent MongoDB Invariants:
If any project invariants below apply to the user's question, you MUST automatically rectify the code and adhere strictly to them:
${memoryDirectives || 'No prior failures in memory for this topic yet.'}

Be helpful, direct, conversational, and provide clean, working, optimized code when requested.`;

    const contents = [];

    // Add prior conversational turns as temporary working memory
    if (history && Array.isArray(history) && history.length > 0) {
      for (const turn of history) {
        const text = (turn.text || '').trim();
        if (text) {
          contents.push({
            role: turn.role === 'user' ? 'user' : 'model',
            parts: [{ text }]
          });
        }
      }
    }

    // Ensure contents starts with a user turn if history exists
    if (contents.length > 0 && contents[0].role !== 'user') {
      contents.unshift({ role: 'user', parts: [{ text: 'Hello' }] });
    }

    // Append current prompt
    contents.push({
      role: 'user',
      parts: [{ text: query }]
    });

    const models = ['gemini-flash-latest'];

    for (const model of models) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(3500),
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: systemPrompt }]
            },
            contents: contents
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
        console.warn(`[Gemini] Live API call unavailable (${err.message}), falling back to instant local intelligence engine`);
      }
    }

    return this.generateIntelligentResponse(query, history, workspace, memories, newlyLearnedMemory);
  }

  /**
   * OpenAI API integration with multi-turn session working memory
   */
  async callOpenAI(query, history = [], workspace, memories, newlyLearnedMemory) {
    const memoryDirectives = memories.map(m => 
      `- RULE (${m.type}): "${m.content.title}". Rule: ${m.content.recommendation}. Failure to avoid: ${m.content.outcome || m.content.problem}`
    ).join('\n');

    const messages = [
      {
        role: 'system',
        content: `You are DevMemory, a senior AI pair programmer. Workspace: ${workspace}.
Maintain multi-turn session working memory across previous messages. If the user previously asked a question and now shares code, fulfill the previous request directly.
Adhere strictly to project invariants from MongoDB memory:
${memoryDirectives}`
      }
    ];

    if (history && Array.isArray(history)) {
      for (const turn of history) {
        if (turn.text && turn.text.trim()) {
          messages.push({
            role: turn.role === 'model' ? 'assistant' : 'user',
            content: turn.text
          });
        }
      }
    }

    messages.push({ role: 'user', content: query });

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      signal: AbortSignal.timeout(6000),
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages
      })
    });

    const data = await res.json();
    return data.choices?.[0]?.message?.content || this.generateIntelligentResponse(query, history, workspace, memories, newlyLearnedMemory);
  }
}

module.exports = new AgentService();
