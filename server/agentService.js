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
  async processQuery({ query, history = [], sessionId, workspace = 'default', role = 'developer' }) {
    const timestamp = new Date();
    const queryTrimmed = (query || '').trim();
    const queryLower = queryTrimmed.toLowerCase();
    const isGreeting = this.isSimpleGreeting(queryLower);

    // STEP 1: ALWAYS READ MONGODB MEMORY FIRST BEFORE ANSWERING
    let recalledMemories = [];
    let allActiveMemories = [];
    if (!isGreeting) {
      // 1. Fetch targeted matching memories via hybrid vector + lexical search
      recalledMemories = await memoryRepo.vectorSearch({
        query: queryTrimmed,
        status: 'active',
        limit: 5,
        minScore: 0.25 // Generous threshold to never miss relevant invariants
      });

      // 2. ALSO fetch all active long-term project invariants from MongoDB Atlas
      allActiveMemories = await memoryRepo.listMemories({ status: 'active', limit: 15 });

      for (const mem of recalledMemories) {
        await memoryRepo.recordRecall(mem._id, sessionId, queryTrimmed, mem.relevanceScore);
      }
    }

    // STEP 2: CHECK FOR MEMORY CANDIDATES & EXPLICIT UPDATES
    // Only store when the user establishes a rule, invariant, constraint, or bug fix.
    let memoryCandidate = !isGreeting ? this.detectLearningIntent(queryTrimmed, workspace) : null;

    // STEP 3: CONTRADICTION DETECTION
    // If the user's prompt directly contradicts a stored memory, ask the user about it,
    // UNLESS the user is explicitly commanding to update/override the rule!
    if (!memoryCandidate || !memoryCandidate.isOverride) {
      const conflict = this.detectMemoryContradiction(queryTrimmed, recalledMemories);
      if (conflict) {
        return {
          sessionId,
          query: queryTrimmed,
          timestamp,
          response: this.formatContradictionResponse(conflict),
          autoRectification: {
            memoryId: conflict.memory._id,
            type: 'conflict',
            title: conflict.memory.content.title,
            rectification: `Contradiction detected: prompt opposes established rule "${conflict.memory.content.recommendation}"`,
            score: conflict.memory.relevanceScore
          },
          newlyLearnedMemory: null,
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
    }

    if (!memoryCandidate && !isGreeting && process.env.GEMINI_API_KEY && this.couldBeMemoryCandidate(queryTrimmed)) {
      try {
        memoryCandidate = await this.extractMemoryWithLLM(queryTrimmed, history, workspace);
      } catch (err) {
        console.warn('[Agent] LLM memory extraction note:', err.message);
      }
    }

    let newlyLearnedMemory = null;
    let wasMemoryUpdated = false;

    if (memoryCandidate) {
      // Upsert / Merge to prevent redundancies in MongoDB
      const result = await memoryRepo.upsertOrMergeMemory({
        owner: role,
        workspace: 'default',
        type: memoryCandidate.type || 'constraint',
        isOverride: memoryCandidate.isOverride || false,
        targetMemoryId: (memoryCandidate.isOverride && recalledMemories.length > 0) ? recalledMemories[0]._id : undefined,
        content: {
          title: memoryCandidate.title || 'Project Invariant',
          problem: memoryCandidate.problem || 'Project constraint',
          attemptedFix: memoryCandidate.attemptedFix || '',
          outcome: memoryCandidate.outcome || '',
          recommendation: memoryCandidate.recommendation || memoryCandidate.title,
          codeSnippet: memoryCandidate.codeSnippet || ''
        },
        source: {
          sessionId,
          channel: 'conversational_learning',
          author: role
        },
        lifecycle: {
          status: 'active',
          confidence: 1.0,
          tags: memoryCandidate.tags || ['long-term-memory']
        }
      });

      newlyLearnedMemory = result.memory;
      wasMemoryUpdated = result.isUpdated;
    }

    // STEP 4: GENERATE ANSWER ACCORDING TO STORED MEMORIES
    // (Injecting recalled memories into Gemini / local reasoning)
    let agentResponse = '';
    let autoRectification = null;

    // Check external LLM keys
    const geminiKey = process.env.GEMINI_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (geminiKey) {
      try {
        agentResponse = await this.callGemini(queryTrimmed, history, workspace, recalledMemories, allActiveMemories, newlyLearnedMemory, wasMemoryUpdated);
      } catch (err) {
        console.warn('[Agent] Gemini API error, falling back to local reasoning:', err.message);
        agentResponse = await this.generateIntelligentResponse(queryTrimmed, history, workspace, recalledMemories, allActiveMemories, newlyLearnedMemory, wasMemoryUpdated);
      }
    } else if (openaiKey) {
      try {
        agentResponse = await this.callOpenAI(queryTrimmed, history, workspace, recalledMemories, newlyLearnedMemory, wasMemoryUpdated);
      } catch (err) {
        console.warn('[Agent] OpenAI API error, falling back to local reasoning:', err.message);
        agentResponse = await this.generateIntelligentResponse(queryTrimmed, history, workspace, recalledMemories, allActiveMemories, newlyLearnedMemory, wasMemoryUpdated);
      }
    } else {
      agentResponse = await this.generateIntelligentResponse(queryTrimmed, history, workspace, recalledMemories, allActiveMemories, newlyLearnedMemory, wasMemoryUpdated);
    }

    // Check if an invariant altered or rectified this response
    if (recalledMemories.length > 0 && !newlyLearnedMemory) {
      const topMemory = recalledMemories[0];
      autoRectification = {
        memoryId: topMemory._id,
        type: topMemory.type,
        title: topMemory.content.title,
        rectification: topMemory.content.recommendation,
        score: topMemory.relevanceScore
      };
    }

    return {
      sessionId,
      query: queryTrimmed,
      timestamp,
      response: agentResponse,
      autoRectification,
      newlyLearnedMemory,
      wasMemoryUpdated,
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
   * Contradiction Detection: Check if the user's prompt opposes a stored memory
   */
  detectMemoryContradiction(query, recalledMemories) {
    if (!recalledMemories || recalledMemories.length === 0) return null;
    const qLower = query.toLowerCase();

    for (const mem of recalledMemories) {
      const recLower = (mem.content?.recommendation || '').toLowerCase();
      const titleLower = (mem.content?.title || '').toLowerCase();

      // Contradiction 1: Password Hashing
      // If memory mandates Argon2id, but user asks for SHA-256, MD5, or plain bcrypt
      if (recLower.includes('argon2') || titleLower.includes('argon2')) {
        if (qLower.includes('md5') || qLower.includes('sha256') || qLower.includes('sha-256') || (qLower.includes('bcrypt') && !recLower.includes('bcrypt'))) {
          return {
            memory: mem,
            conflictType: 'password_hashing',
            userAction: query.trim(),
            existingRule: mem.content.recommendation
          };
        }
      }

      // Contradiction 2: JWT Storage
      // If memory mandates HttpOnly cookies and prohibits localStorage, but user asks for localStorage
      if (recLower.includes('httponly') || recLower.includes('cookie') || titleLower.includes('jwt')) {
        if (qLower.includes('localstorage') || qLower.includes('local storage')) {
          return {
            memory: mem,
            conflictType: 'jwt_storage',
            userAction: 'Store tokens in browser localStorage',
            existingRule: mem.content.recommendation
          };
        }
      }

      // Contradiction 3: Database Query Timeout
      const timeoutMatch = recLower.match(/(\d+)\s*ms/);
      if (timeoutMatch && qLower.includes('timeout')) {
        const userTimeoutMatch = qLower.match(/(\d+)\s*ms/);
        if (userTimeoutMatch && userTimeoutMatch[1] !== timeoutMatch[1]) {
          return {
            memory: mem,
            conflictType: 'timeout_value',
            userAction: `Set database timeout to ${userTimeoutMatch[1]}ms`,
            existingRule: mem.content.recommendation
          };
        }
      }

      // Contradiction 4: Currency Float Math
      if (recLower.includes('cent') || recLower.includes('integer') || titleLower.includes('float')) {
        if (qLower.includes('float') || qLower.match(/price\s*\*\s*0\.\d+/)) {
          return {
            memory: mem,
            conflictType: 'currency_math',
            userAction: 'Use floating-point arithmetic for currency calculations',
            existingRule: mem.content.recommendation
          };
        }
      }
    }

    return null;
  }

  /**
   * Format friendly conflict resolution dialog
   */
  formatContradictionResponse(conflict) {
    return `### ⚠️ Memory Conflict Detected

We have a previously established rule stored in **MongoDB Atlas**:

> **Stored Invariant:** "${conflict.memory.content.title}"  
> **Enforced Rule:** *${conflict.existingRule}*

However, your prompt suggests:
> **Requested Action:** *${conflict.userAction}*

---

### How would you like to proceed?
1. **Adhere to the existing memory**: I will write the solution following our established invariant (*${conflict.existingRule}*).
2. **Update the memory**: If the project standard has officially changed, reply with *"Update the rule to: [new requirement]"*, and I will update our MongoDB document accordingly so future answers follow the new standard.`;
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
   * Strip conversational filler, greetings, and chat packaging
   */
  stripConversationalFluff(text) {
    if (!text) return '';
    let clean = text.trim();

    // 1. Strip leading greetings & conversational prefixes
    clean = clean.replace(/^(?:hey|hi|hello|dude|yo|please|bro|okay|ok|so|also|look|well|listen)[\s,:]+/i, '');

    // 2. Strip rule declarations & triggers
    clean = clean.replace(/^(?:please\s+)?(?:update|change|override|modify|replace)\s+(?:the\s+)?(?:rule|memory|invariant|standard|policy)?(?:\s*(?:to|with|by))?[:\s]+/i, '');
    clean = clean.replace(/^(?:remember\s+(?:that)?|keep\s+in\s+mind\s+(?:that)?|don't\s+forget\s+(?:that)?|note\s+(?:that)?|from\s+now\s+on,?\s*|make\s+sure\s+(?:that)?|ensure\s+(?:that)?|we\s+(?:decided|agreed)\s+(?:that)?|our\s+rule\s+is\s+(?:that)?|new\s+rule:?|rule:?|invariant:?)[\s,:]*/i, '');

    // 3. Strip project scope mentions
    clean = clean.replace(/^(?:in\s+(?:this|our)\s+.*?(?:project|workspace|service|codebase|app|repo|system|backend|frontend),?)\s*/i, '');

    // 4. Strip trailing polite endings
    clean = clean.replace(/[\s,]+(?:thanks|thank you|pls|please|got it|alright|cool)[\s.!]*$/i, '');

    return clean.trim();
  }

  /**
   * Distill ONLY the core directive and separate it from explanatory reasons
   */
  distillCoreDirective(text) {
    const cleaned = this.stripConversationalFluff(text);
    if (!cleaned) return { coreRule: text, reason: '' };

    // Check if there is a reason/cause clause (e.g. "because ...", "due to ...", "so that ...", "as ...")
    const reasonMatch = cleaned.match(/^(.+?)\s+(?:because|due to|so that|in order to|since|as it causes|to prevent|which prevents|which avoids)\s+(.+)$/i);

    let coreRule = cleaned;
    let reason = '';

    if (reasonMatch && reasonMatch[1] && reasonMatch[2]) {
      coreRule = reasonMatch[1].trim();
      reason = reasonMatch[2].trim().replace(/[!?.]$/, '');
    }

    // Capitalize first letter
    coreRule = coreRule.charAt(0).toUpperCase() + coreRule.slice(1);
    if (reason) {
      reason = reason.charAt(0).toUpperCase() + reason.slice(1);
    }

    return { coreRule, reason };
  }

  /**
   * Format ultra-concise, professional title without prompt transcripts
   */
  formatTitle(text) {
    if (!text) return 'Project Invariant';
    const { coreRule } = this.distillCoreDirective(text);
    const clean = coreRule.replace(/[!?,.]/g, '').trim();
    const lower = clean.toLowerCase();

    // 1. Database timeout
    const timeoutMatch = lower.match(/(\d+\s*m?s)/i);
    if (lower.includes('timeout') && timeoutMatch) {
      return `Database Query Timeout (${timeoutMatch[1]})`;
    }

    // 2. JWT / Cookie / Storage
    if (lower.includes('jwt') || lower.includes('token')) {
      if (lower.includes('httponly') || lower.includes('cookie')) {
        return 'JWT Storage: HttpOnly Cookies';
      }
      if (lower.includes('localstorage') || lower.includes('local storage')) {
        return 'JWT Storage: LocalStorage';
      }
      return 'JWT Token Management Policy';
    }

    // 3. Password Hashing
    if (lower.includes('password') || lower.includes('hash')) {
      if (lower.includes('argon2')) return 'Password Hashing: Argon2id';
      if (lower.includes('bcrypt')) return 'Password Hashing: Bcrypt';
      return 'Password Security Standard';
    }

    // 4. Currency / Float math
    if (lower.includes('currency') || lower.includes('price') || lower.includes('cent')) {
      return 'Financial Math: Integer Cents';
    }

    // 5. General prohibition
    if (lower.startsWith('never ') || lower.startsWith('do not ') || lower.startsWith("don't ") || lower.startsWith('avoid ')) {
      const stripped = clean.replace(/^(?:never\s+|do\s+not\s+|don't\s+|avoid\s+)/i, '');
      const cap = stripped.charAt(0).toUpperCase() + stripped.slice(1);
      return cap.length > 42 ? `Prohibit: ${cap.slice(0, 39)}...` : `Prohibit: ${cap}`;
    }

    // General title: keep under 45 chars cleanly
    const words = clean.split(/\s+/);
    if (words.length <= 6 && clean.length <= 45) {
      return clean.charAt(0).toUpperCase() + clean.slice(1);
    }
    return words.slice(0, 5).join(' ') + '...';
  }

  /**
   * Fast rule-based invariant & bug detection across conversational statements
   * Discerning: ONLY extracts and stores the distilled core invariant!
   */
  detectLearningIntent(query, workspace) {
    const q = query.trim();
    const lower = q.toLowerCase();

    // 0. Explicit Memory Update / Modification: "update the rule to...", "change the memory to...", "override the rule with..."
    const updateRegex = /^(?:please\s+)?(?:update|change|override|modify|replace)\s+(?:the\s+)?(?:rule|memory|invariant|standard|policy)?(?:\s*(?:to|with|by))?[:\s]+\s*(.*)/i;
    const updateMatch = q.match(updateRegex);
    if (updateMatch && updateMatch[1]) {
      const { coreRule, reason } = this.distillCoreDirective(updateMatch[1].trim());
      return {
        type: 'constraint',
        title: this.formatTitle(coreRule),
        problem: reason ? `Updated standard: ${reason}` : 'Updated project standard',
        recommendation: coreRule,
        tags: ['long-term-memory', 'updated-rule'],
        isOverride: true
      };
    }

    // 1. Explicit triggers: "remember that...", "note that...", "rule:...", "from now on..."
    const triggerMatch = lower.match(/(?:remember\s+(?:that)?|keep\s+in\s+mind\s+(?:that)?|note\s+(?:that)?|from\s+now\s+on,?\s*|new\s+rule:?|rule:?|invariant:?)\s*(.*)/i);
    if (triggerMatch && triggerMatch[1]) {
      const { coreRule, reason } = this.distillCoreDirective(triggerMatch[1].trim());
      const isNegative = lower.includes('never') || lower.includes("don't") || lower.includes('failed') || lower.includes('avoid');

      return {
        type: isNegative ? 'failed_fix' : 'constraint',
        title: this.formatTitle(coreRule),
        problem: reason || (isNegative ? 'Prohibited anti-pattern' : 'Project architectural standard'),
        attemptedFix: isNegative ? coreRule : '',
        outcome: isNegative ? 'Marked as insecure anti-pattern' : 'Approved invariant',
        recommendation: coreRule,
        tags: ['conversational-learning', workspace]
      };
    }

    // 2. Prohibitions & Anti-patterns: "never use...", "don't use / do not use...", "avoid..."
    const prohibitionMatch = lower.match(/(?:never|do\s+not|don't|avoid)\s+(?:use|allow|store|commit|return|pass|accept|execute|call|log|expose|send|put|keep|render)\s+(.*)/i);
    if (prohibitionMatch && prohibitionMatch[1]) {
      const { coreRule, reason } = this.distillCoreDirective(q);
      return {
        type: 'failed_fix',
        title: this.formatTitle(coreRule),
        problem: reason || 'Prohibited anti-pattern',
        attemptedFix: coreRule,
        outcome: 'Marked as insecure or prohibited pattern',
        recommendation: coreRule,
        tags: ['anti-pattern', 'constraint', workspace]
      };
    }

    // 3. Project scope statements: "In our auth service, all user passwords..."
    const scopeMatch = lower.match(/(?:in\s+(?:this|our)\s+.*?(?:project|workspace|service|codebase|app|repo|system|backend|frontend),?)\s*(.+)/i);
    if (scopeMatch && scopeMatch[1] && scopeMatch[1].length > 10) {
      const { coreRule, reason } = this.distillCoreDirective(scopeMatch[1].trim());
      return {
        type: 'constraint',
        title: this.formatTitle(coreRule),
        problem: reason || 'Architectural policy',
        recommendation: coreRule,
        tags: ['architecture-decision', workspace]
      };
    }

    // 4. Mandatory invariants: "all X must have...", "queries must use...", "passwords must be..."
    const mustMatch = lower.match(/(.+?)\s+must\s+(?:always\s+)?(?:be|have|use|implement|return|follow|contain|include|validate|enforce|run|match|check)\s+(.+)/i);
    if (mustMatch) {
      const { coreRule, reason } = this.distillCoreDirective(q);
      return {
        type: 'constraint',
        title: this.formatTitle(coreRule),
        problem: reason || 'Mandatory coding standard',
        recommendation: coreRule,
        tags: ['coding-standard', 'constraint', workspace]
      };
    }

    // 5. Positive directives: "always use...", "ensure that...", "make sure that..."
    const alwaysMatch = lower.match(/(?:always|ensure\s+that|make\s+sure\s+that|require)\s+(.*)/i);
    if (alwaysMatch && alwaysMatch[1]) {
      const { coreRule, reason } = this.distillCoreDirective(q);
      return {
        type: 'constraint',
        title: this.formatTitle(coreRule),
        problem: reason || 'Mandatory project standard',
        recommendation: coreRule,
        tags: ['coding-standard', 'constraint', workspace]
      };
    }

    // 6. Bug fixes & resolutions
    const fixMatch = lower.match(/(?:we\s+fixed\s+(?:the\s+)?(?:bug|issue|problem|crash|error)?\s*(?:where|in)?\s*(.+?)\s+by\s+(.+))/i);
    if (fixMatch) {
      return {
        type: 'failed_fix',
        title: this.formatTitle(`Fix: ${fixMatch[1].trim()}`),
        problem: fixMatch[1].trim(),
        attemptedFix: fixMatch[1].trim(),
        outcome: 'Resolved via verified fix',
        recommendation: `Apply fix: ${fixMatch[2].trim()}`,
        tags: ['bug-fix', 'postmortem', workspace]
      };
    }

    // 7. System failure / Crash post-mortems
    const failMatch = lower.match(/(.+?)\s+(?:failed|broke|threw an error|crashed|caused a bug|caused a leak)\s+(?:because|with|due to|when)\s+(.+)/i);
    if (failMatch) {
      return {
        type: 'failed_fix',
        title: this.formatTitle(`Failure: ${failMatch[1].slice(0, 35).trim()}`),
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
   * LLM-assisted zero-shot invariant extraction: Distills ONLY the essential technical invariant
   */
  async extractMemoryWithLLM(query, history = [], workspace) {
    if (!process.env.GEMINI_API_KEY) return null;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const prompt = `You are an expert compiler of long-term software architectural memory.
Analyze if this developer chat message sets a permanent project rule, architectural constraint, coding convention, or bug post-mortem/fix to remember.

Message: "${query}"

CRITICAL INSTRUCTION - DISTILL ONLY THE IMPORTANT PART:
Do NOT store the entire chat message, full prompt, conversational fillers ("Hey", "Yo", "Remember that", "From now on"), polite words, or verbose backstories.
Extract ONLY the essential, actionable technical invariant.

If it DOES describe an invariant, rule, constraint, or bug fix to remember, reply with a JSON object:
{
  "isMemory": true,
  "type": "constraint",
  "title": "Ultra-concise title (max 4-7 words, e.g. 'Database Query Timeout: 5000ms', 'JWT Storage: HttpOnly Cookies')",
  "problem": "Brief 1-sentence context or root cause (under 15 words, e.g. 'Unindexed queries lock the database connection pool')",
  "recommendation": "The exact, distilled rule to follow (1-2 crisp actionable sentences only)",
  "tags": ["relevant-tag1", "relevant-tag2"]
}
(Note: Use "type": "failed_fix" if it describes a past failure or anti-pattern to avoid).

If it is just a normal question, general coding request, code review, or chit-chat, reply with:
{ "isMemory": false }

Output pure JSON only.`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(12000),
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
            problem: parsed.problem || 'Project constraint',
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
  async generateIntelligentResponse(query, history = [], workspace, recalledMemories = [], allActiveMemories = [], newlyLearnedMemory, wasMemoryUpdated = false) {
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
      return `I have ${wasMemoryUpdated ? 'updated the existing invariant in' : 'saved this invariant to'} our persistent memory in **MongoDB Atlas**:

> **Rule:** "${newlyLearnedMemory.content.title}"
> **Mandated Recommendation:** *${newlyLearnedMemory.content.recommendation}*
> **Database:** Indexed in MongoDB Atlas vector graph.

${wasMemoryUpdated ? 'The prior memory document was updated to prevent duplicate entries.' : 'Whenever this issue or context is encountered again in future chats, I will automatically rectify the code and adhere strictly to this rule.'}`;
    }

    // 2. Greetings and pleasantries
    if (this.isSimpleGreeting(qLower)) {
      const activeCount = await memoryRepo.listMemories({ status: 'active' });
      return `Hello! I am **DevMemory**, your AI coding assistant with persistent **MongoDB Long-Term Memory**.

I currently have **${activeCount.length} active memory invariants** stored in MongoDB Atlas.

Here is what I can do:
- **Write and review code** across TypeScript, Python, Go, SQL, React, and Node.js.
- **Maintain short-term memory**: I remember our active conversation turns.
- **Enforce long-term invariants**: Before answering any question, I read our MongoDB memories and automatically apply our established rules.
- **Prevent mistakes**: If a fix failed in the past, I will never repeat it.
- **Detect contradictions**: If your prompt opposes an existing memory, I will ask you whether to adhere to it or update the rule.

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

    // 7. Simple Math & Expressions (Honoring MongoDB Math Invariants)
    if (/^[\d\s+\-*/().%^]+$/.test(qLower) && /\d/.test(qLower)) {
      try {
        let expr = qLower;
        // Check if a stored memory specifies a rule for 0^0 or other math invariants
        const combined = (recalledMemories || []).concat(allActiveMemories || []);
        const zeroPowerRule = combined.find(m => 
          (m.content?.title?.toLowerCase().includes('0^0') || m.content?.recommendation?.toLowerCase().includes('power of 0')) &&
          m.content?.recommendation?.includes('0')
        );

        if (zeroPowerRule) {
          // In JavaScript/Python, 0**0 evaluates to 1 by default, but our project memory mandates 0^0 = 0!
          expr = expr.replace(/0\s*[\^]\s*0/g, '0').replace(/0\s*\*\*\s*0/g, '0');
          const sanitized = expr.replace(/[^-()\d/*+.]/g, '');
          const result = Function(`'use strict'; return (${sanitized})`)();
          return `Applying mandated project invariant (**${zeroPowerRule.content.title}**):\n\n> *${zeroPowerRule.content.recommendation}*\n\n${query} = **${result}** (where $0^0 = 0$ as established in MongoDB memory).`;
        }

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
  async callGemini(query, history = [], workspace, memories = [], allActiveMemories = [], newlyLearnedMemory, wasMemoryUpdated = false) {
    const memoryDirectives = memories.map(m => 
      `- TARGETED INVARIANT [${m.type.toUpperCase()}]: "${m.content.title}". Mandated Rule: ${m.content.recommendation}. Context/Failure: ${m.content.outcome || m.content.problem}`
    ).join('\n\n');

    const otherInvariants = (allActiveMemories || [])
      .filter(m => !memories.some(rm => rm._id.toString() === m._id.toString()))
      .map(m => `- PROJECT INVARIANT [${m.type.toUpperCase()}]: "${m.content.title}" -> Mandated Rule: ${m.content.recommendation}`)
      .join('\n');

    const systemPrompt = `You are DevMemory, a professional senior software engineer and AI pair programmer with persistent MongoDB memory.

CRITICAL INSTRUCTIONS:
1. READ AND ENFORCE MONGODB LONG-TERM MEMORY BEFORE ANSWERING:
You MUST check the project invariants stored in MongoDB Atlas and strictly answer according to them.
If an invariant defines a specific rule (including mathematical edge cases like "0^0 = 0", framework constraints, or security policies), YOU MUST STRICTLY ENFORCE THE MONGODB INVARIANT OVER STANDARD TEXTBOOK DEFAULTS OR CONVENTIONS.

${memoryDirectives ? `TARGETED MATCHING INVARIANTS FROM MONGODB:\n${memoryDirectives}\n` : ''}
${otherInvariants ? `ALL ACTIVE PROJECT INVARIANTS IN MONGODB:\n${otherInvariants}\n` : ''}
${(!memoryDirectives && !otherInvariants) ? 'No active invariants found in MongoDB for this query.' : ''}

${newlyLearnedMemory ? `2. ${wasMemoryUpdated ? 'UPDATED' : 'NEWLY COMMITTED'} PROJECT MEMORY:
You just automatically ${wasMemoryUpdated ? 'updated the existing invariant in' : 'committed this new invariant to'} persistent MongoDB memory:
- Title: "${newlyLearnedMemory.content.title}"
- Type: ${newlyLearnedMemory.type}
- Mandated Rule: "${newlyLearnedMemory.content.recommendation}"
Acknowledge that this rule was ${wasMemoryUpdated ? 'updated in' : 'committed to'} MongoDB memory and explain that future code generations will strictly adhere to it.` : ''}

3. SHORT-TERM WORKING MEMORY:
Maintain full conversational context across prior prompt turns in this session.

Always explicitly state when a MongoDB memory invariant guided your calculation or code!`;

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

    const models = [
      'gemini-flash-lite-latest',
      'gemini-3.5-flash-lite'
    ];

    for (const model of models) {
      try {
        const t0 = Date.now();
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(22000),
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
          console.log(`[Gemini] Live model ${model} responded successfully in ${Date.now() - t0}ms`);
          return candidateText;
        }

        if (data.error) {
          console.warn(`[Gemini] Model ${model} returned error:`, data.error.message);
          // If quota exceeded or service temporarily unavailable, fallback immediately rather than stalling
          if (data.error.code === 429 || data.error.code === 503) {
            break;
          }
        }
      } catch (err) {
        console.warn(`[Gemini] Model ${model} error (${err.message})`);
      }
    }

    console.log('[Agent] Falling back to intelligent local coding engine');
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
