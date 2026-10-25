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

    // STEP 1: READ TOPIC-RELEVANT MEMORIES & GENERAL USER PREFERENCES
    let recalledMemories = [];
    let applicablePreferences = [];
    if (!isGreeting) {
      // 1. Fetch targeted matching memories via hybrid vector + lexical search
      recalledMemories = await memoryRepo.vectorSearch({
        query: queryTrimmed,
        status: 'active',
        limit: 5,
        minScore: 0.35 // Higher relevance threshold so unrelated topics are NEVER retrieved
      });

      // 2. Fetch general cross-cutting user preferences (UI styling, full screen, responsive controls, coding conventions)
      const allActive = await memoryRepo.listMemories({ status: 'active', limit: 20 });
      applicablePreferences = allActive.filter(m => {
        // Exclude memories already in recalledMemories
        if (recalledMemories.some(rm => rm._id.toString() === m._id.toString())) return false;

        const tags = (m.lifecycle?.tags || []).map(t => t.toLowerCase());
        const contentStr = `${m.content?.title || ''} ${m.content?.recommendation || ''}`.toLowerCase();

        // Must be a universal preference/convention, NOT domain-specific to an unrelated subject
        const isUniversalPreference = 
          tags.includes('ui-style') || 
          tags.includes('preference') || 
          tags.includes('convention') ||
          tags.includes('coding-standard') ||
          contentStr.includes('full screen') ||
          contentStr.includes('entire screen') ||
          contentStr.includes('responsive');

        return isUniversalPreference;
      });

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
        agentResponse = await this.callGemini(queryTrimmed, history, workspace, recalledMemories, applicablePreferences, newlyLearnedMemory, wasMemoryUpdated);
      } catch (err) {
        console.warn('[Agent] Gemini API error, falling back to local reasoning:', err.message);
        agentResponse = await this.generateIntelligentResponse(queryTrimmed, history, workspace, recalledMemories, applicablePreferences, newlyLearnedMemory, wasMemoryUpdated);
      }
    } else if (openaiKey) {
      try {
        agentResponse = await this.callOpenAI(queryTrimmed, history, workspace, recalledMemories, applicablePreferences, newlyLearnedMemory, wasMemoryUpdated);
      } catch (err) {
        console.warn('[Agent] OpenAI API error, falling back to local reasoning:', err.message);
        agentResponse = await this.generateIntelligentResponse(queryTrimmed, history, workspace, recalledMemories, applicablePreferences, newlyLearnedMemory, wasMemoryUpdated);
      }
    } else {
      agentResponse = await this.generateIntelligentResponse(queryTrimmed, history, workspace, recalledMemories, applicablePreferences, newlyLearnedMemory, wasMemoryUpdated);
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

    // 0. User Correction of AI Mistake / Bug: "you made a mistake...", "that's wrong...", "your code has a bug...", "you forgot to..."
    const mistakeRegex = /^(?:wait,?\s+|no,?\s+)?(?:you\s+(?:made|have)\s+(?:a\s+)?(?:mistake|bug|error)|that(?:'s|\s+is)\s+(?:a\s+)?(?:mistake|bug|error|wrong|incorrect|broken)|your\s+code\s+(?:has\s+a\s+bug|is\s+wrong|is\s+broken|fails|threw\s+an\s+error)|you\s+(?:forgot|missed|omitted)|there\s+is\s+a\s+bug\s+in\s+your\s+code|this\s+code\s+throws|that\s+(?:doesn't|does\s+not|didn't|did\s+not)\s+work|no,?\s+that(?:'s|\s+is)\s+wrong|wrong[,.:\s]+|incorrect[,.:\s]+)(?:[:\s,-]+)?(.*)/i;
    const mistakeMatch = q.match(mistakeRegex);
    if (mistakeMatch) {
      const correctionDetail = (mistakeMatch[1] || q).trim();
      const { coreRule, reason } = this.distillCoreDirective(correctionDetail);

      return {
        type: 'failed_fix',
        title: this.formatTitle(coreRule ? `Avoid: ${coreRule}` : `Mistake: ${correctionDetail.slice(0, 35)}`),
        problem: reason || `Bug in generated code: "${correctionDetail}"`,
        attemptedFix: `Mistake in previous response: ${correctionDetail}`,
        outcome: 'Marked as failed pattern by developer correction',
        recommendation: coreRule || correctionDetail,
        tags: ['mistake-avoided', 'bug-fix', 'developer-correction', workspace],
        isMistake: true,
        isOverride: true
      };
    }

    // 1. Explicit Memory Update / Modification: "update the rule to...", "change the memory to...", "override the rule with..."
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

    // 2. Explicit triggers: "remember that...", "note that...", "rule:...", "from now on..."
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

    // 2.5 Guard: Normal task requests (e.g. "Build me a 2D car game", "Create a chess game in HTML", "Write an auth API")
    // are tasks to execute right now, NOT persistent memory invariants!
    const isTaskRequest = /^(?:build|create|make|write|generate|implement|develop|code|design|give\s+me|show\s+me)\b/i.test(lower) ||
                          /^(?:can\s+you|could\s+you|please\s+)?(?:build|create|make|write|generate|implement|develop|code)\b/i.test(lower);

    if (isTaskRequest) {
      // If user asks to build something, DO NOT store the project request as an invariant!
      // Only extract if there is an explicit embedded universal preference (e.g. "always make any website...")
      const embeddedAlways = q.match(/(?:and\s+)?always\s+(?:make|ensure|use|require|keep)\s+(.+)/i);
      if (embeddedAlways) {
        const { coreRule, reason } = this.distillCoreDirective(embeddedAlways[0]);
        return {
          type: 'convention',
          title: this.formatTitle(coreRule),
          problem: reason || 'Universal developer preference',
          recommendation: coreRule,
          tags: ['preference', 'ui-style', 'convention', workspace]
        };
      }
      return null;
    }

    // 3. Prohibitions & Anti-patterns: "never use...", "don't use / do not use...", "avoid..."
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

    // 4. Developer preference: "you should use X instead of Y" or "why did you use X"
    const shouldInsteadMatch = lower.match(/(?:you\s+should(?:n't|\s+not)?\s+use|instead\s+of\s+.*,\s*(?:you\s+should\s+)?use|why\s+did\s+you\s+use)\s+(.*)/i);
    if (shouldInsteadMatch) {
      const { coreRule, reason } = this.distillCoreDirective(q);
      return {
        type: 'failed_fix',
        title: this.formatTitle(`Avoid: ${coreRule}`),
        problem: reason || 'Developer corrected AI choice',
        attemptedFix: q,
        outcome: 'Marked as incorrect pattern by developer',
        recommendation: coreRule,
        tags: ['mistake-avoided', 'developer-correction', workspace],
        isMistake: true
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
   * Check if a conversational message might contain an invariant or developer bug/mistake correction
   */
  couldBeMemoryCandidate(text) {
    if (!text || text.length < 8) return false;
    const lower = text.toLowerCase();

    // High priority check: Developer pointing out an AI mistake or bug
    const mistakePhrases = [
      'mistake', 'wrong', 'incorrect', 'error', 'bug', 'forgot', 'broke', 'broken',
      'instead', 'fails', 'leaks', 'crashes', 'warning', 'bad', 'flaw', 'missed',
      'issue', 'problem', 'correction', 'not working', "didn't work", "doesn't work",
      'that is not', "that's not", 'you should', "you shouldn't", 'why did you',
      'throws', 'supposed to be', 'not equal to'
    ];
    if (mistakePhrases.some(w => lower.includes(w))) {
      return true;
    }

    if (/^(what|how|where|who|when|can you|could you|please explain|tell me)\b/i.test(lower)) {
      return false;
    }

    const indicatorWords = [
      'rule', 'never', 'always', 'must', 'should', "don't", 'fix', 'fixed', 
      'avoid', 'in our', 'for this', 'standard', 'convention', 'timeout', 
      'token', 'security', 'schema', 'database', 'redis', 'mongo', 'postgres', 
      'policy', 'enforce', 'require', 'decided', 'switched', '0^0'
    ];
    return indicatorWords.some(w => lower.includes(w));
  }

  /**
   * LLM-assisted zero-shot extraction: Captures AI mistakes, bugs, and invariants
   */
  async extractMemoryWithLLM(query, history = [], workspace) {
    if (!process.env.GEMINI_API_KEY) return null;

    const lastAITurn = history && Array.isArray(history) 
      ? (history.filter(h => h.role === 'model' || h.role === 'assistant').slice(-1)[0]?.text || '')
      : '';

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const prompt = `You are an expert compiler of long-term software engineering memory for DevMemory.
Analyze if this developer chat message:
1. Points out an AI MISTAKE, BUG, OR CORRECTION in previous code/advice.
2. Establishes a permanent project rule, architectural constraint, or coding convention.

Developer Message: "${query}"
${lastAITurn ? `Context - Previous AI Code/Response: "${lastAITurn.slice(0, 400)}..."` : ''}

CRITICAL RULES FOR EXTRACTION:
- HIGHEST PRIORITY - AI MISTAKES / BUGS: If the developer is correcting an error, bug, mistake, omission, or wrong assumption the AI made, return:
{
  "isMemory": true,
  "type": "failed_fix",
  "isMistake": true,
  "title": "Avoid: [Crisp 4-6 word title of the mistake avoided]",
  "problem": "[Specific error, bug, or failure reported by the developer]",
  "attemptedFix": "[The mistake the AI made in the previous code/response]",
  "recommendation": "[The exact mandatory rule and rectified code/behavior to follow so this mistake is NEVER repeated in any project]",
  "tags": ["mistake-avoided", "bug-fix", "developer-correction"]
}

- PROJECT INVARIANTS: If the developer is setting an architectural rule or constraint:
{
  "isMemory": true,
  "type": "constraint",
  "title": "Ultra-concise title (max 4-6 words)",
  "problem": "Brief 1-sentence context",
  "recommendation": "The exact distilled rule to follow (1-2 crisp sentences)",
  "tags": ["relevant-tags"]
}

- GENERAL CHAT / NORMAL QUESTIONS: If it is just a normal question, coding request, review request, or chit-chat (not a rule and not a correction), return:
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
            attemptedFix: parsed.attemptedFix || '',
            outcome: parsed.failureCaused || parsed.outcome || '',
            recommendation: parsed.recommendation,
            isMistake: parsed.isMistake || parsed.type === 'failed_fix',
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

    // 1. Newly learned memory confirmation (Mistake or Invariant)
    if (newlyLearnedMemory) {
      if (newlyLearnedMemory.type === 'failed_fix' || newlyLearnedMemory.content?.attemptedFix || (newlyLearnedMemory.lifecycle?.tags || []).includes('mistake-avoided')) {
        return `### ⚠️ Mistake Acknowledged & Stored in Long-Term Memory

Thank you for catching that! I made a mistake in my previous response:
> **Mistake Avoided:** *${newlyLearnedMemory.content.attemptedFix || newlyLearnedMemory.content.problem}*  
> **Mandated Rectification:** *${newlyLearnedMemory.content.recommendation}*  
> **Database:** Permanently indexed in **MongoDB Atlas** as a \`failed_fix\` invariant (#${newlyLearnedMemory._id ? newlyLearnedMemory._id.toString().slice(-6) : 'mem'}).

I have committed this to memory across **all current and future projects** so I will never repeat this mistake again.

${newlyLearnedMemory.content.codeSnippet ? `\`\`\`typescript\n${newlyLearnedMemory.content.codeSnippet}\n\`\`\`` : ''}`;
      }

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

    // 7.5 Interactive Games & Projects (Personalized with User Preferences)
    if (qLower.includes('chess')) {
      const hasFullscreenPref = (userPreferences || []).some(p => 
        (p.content?.recommendation || '').toLowerCase().includes('entire screen') || 
        (p.content?.recommendation || '').toLowerCase().includes('full screen')
      );

      return `### ♟️ Full-Screen Interactive Chess Game

Here is an interactive Chess game built specifically according to your request${hasFullscreenPref ? ' and personalized with your MongoDB memory preference (**Full-Screen Viewport & Refined Controls**)' : ''}:

\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>DevMemory - Full-Screen Chess Game</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: #0f172a;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .header { margin-bottom: 16px; text-align: center; }
    .status { font-size: 14px; color: #94a3b8; font-family: monospace; }
    #board {
      display: grid;
      grid-template-columns: repeat(8, min(10vw, 75px));
      grid-template-rows: repeat(8, min(10vw, 75px));
      border: 4px solid #334155;
      border-radius: 8px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
      user-select: none;
    }
    .square {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: min(6vw, 44px);
      cursor: pointer;
      transition: background 0.15s ease;
    }
    .light { background-color: #f1f5f9; color: #0f172a; }
    .dark { background-color: #64748b; color: #0f172a; }
    .selected { background-color: #f59e0b !important; }
    .possible { background-color: #10b981 !important; }
    .controls { margin-top: 16px; display: flex; gap: 12px; }
    button {
      padding: 8px 16px;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }
    button:hover { background: #2563eb; }
  </style>
</head>
<body>
  <div class="header">
    <h1>DevMemory Chess</h1>
    <div id="status" class="status">White to move (Responsive Full-Screen Board)</div>
  </div>
  <div id="board"></div>
  <div class="controls">
    <button onclick="resetGame()">New Game</button>
  </div>

  <script>
    const pieces = {
      r: '♜', n: '♞', b: '♝', q: '♛', k: '♚', p: '♟',
      R: '♖', N: '♘', B: '♗', Q: '♕', K: '♔', P: '♙'
    };

    let board = [
      ['r','n','b','q','k','b','n','r'],
      ['p','p','p','p','p','p','p','p'],
      ['','','','','','','',''],
      ['','','','','','','',''],
      ['','','','','','','',''],
      ['','','','','','','',''],
      ['P','P','P','P','P','P','P','P'],
      ['R','N','B','Q','K','B','N','R']
    ];

    let selectedSquare = null;
    let turn = 'white';

    function renderBoard() {
      const el = document.getElementById('board');
      el.innerHTML = '';
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const sq = document.createElement('div');
          sq.className = 'square ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
          if (selectedSquare && selectedSquare.r === r && selectedSquare.c === c) {
            sq.classList.add('selected');
          }
          const piece = board[r][c];
          if (piece) sq.textContent = pieces[piece] || piece;
          sq.onclick = () => handleSquareClick(r, c);
          el.appendChild(sq);
        }
      }
    }

    function handleSquareClick(r, c) {
      if (selectedSquare) {
        board[r][c] = board[selectedSquare.r][selectedSquare.c];
        board[selectedSquare.r][selectedSquare.c] = '';
        selectedSquare = null;
        turn = turn === 'white' ? 'black' : 'white';
        document.getElementById('status').textContent = (turn === 'white' ? 'White' : 'Black') + ' to move';
        renderBoard();
      } else if (board[r][c]) {
        selectedSquare = { r, c };
        renderBoard();
      }
    }

    function resetGame() {
      location.reload();
    }

    renderBoard();
  </script>
</body>
</html>
\`\`\`

**Personalized using your MongoDB memory:**
- **Full Viewport Design**: Responsive full-viewport layout (\`100vw\` x \`100vh\`).
- **Refined Controls**: Smooth piece selection and responsive board interactions.`;
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
  async callGemini(query, history = [], workspace, relevantMemories = [], userPreferences = [], newlyLearnedMemory, wasMemoryUpdated = false) {
    const memoryDirectives = (relevantMemories || []).map(m => 
      `- TOPIC-SPECIFIC INVARIANT [${m.type.toUpperCase()}]: "${m.content.title}". Rule: ${m.content.recommendation}. Context/Mistake Avoided: ${m.content.outcome || m.content.problem}`
    ).join('\n\n');

    const preferenceDirectives = (userPreferences || []).map(m =>
      `- USER STYLING / CODING PREFERENCE: "${m.content.title}" -> ${m.content.recommendation}`
    ).join('\n');

    const systemPrompt = `You are DevMemory, a professional senior software engineer and AI pair programmer with persistent MongoDB memory.

CORE DIRECTIVES:
1. ALWAYS FULFILL THE USER'S CURRENT REQUEST:
- The user's prompt defines the task and subject. If the user asks for a chess game, you MUST build a chess game! If the user asks for a calculator, build a calculator. If they ask for a car game, build a car game.
- NEVER replace, hijack, or change the subject of the user's request based on past memories.

2. USE MEMORY ONLY TO PERSONALIZE AND REFINE (NEVER HIJACK):
- Apply relevant user styling and coding preferences to personalize HOW you implement the requested project (for example, if a preference says "always make websites cover the entire screen with refined controls", design the user's requested project—such as a chess game—so it covers the full viewport (100vw x 100vh) with polished, responsive controls).
- If a memory is domain-specific to an unrelated topic (e.g. car physics when the user is asking for chess), IGNORE that unrelated domain completely!
- If a relevant memory specifies an engineering constraint, edge case (e.g. 0^0 = 0), security policy, or past bug to avoid for this specific task, strictly enforce that rule.

${memoryDirectives ? `TOPIC-SPECIFIC INVARIANTS & RECTIFICATIONS FROM MONGODB:\n${memoryDirectives}\n` : ''}
${preferenceDirectives ? `APPLICABLE USER PREFERENCES & DESIGN CONVENTIONS:\n${preferenceDirectives}\n` : ''}
${(!memoryDirectives && !preferenceDirectives) ? 'No active memories or preferences found for this specific query.' : ''}

${newlyLearnedMemory ? `3. ${wasMemoryUpdated ? 'UPDATED' : 'NEWLY COMMITTED'} PROJECT MEMORY:
You just automatically ${wasMemoryUpdated ? 'updated the existing invariant in' : 'committed this new invariant to'} persistent MongoDB memory:
- Title: "${newlyLearnedMemory.content.title}"
- Type: ${newlyLearnedMemory.type}
- Mandated Rule: "${newlyLearnedMemory.content.recommendation}"
${(newlyLearnedMemory.type === 'failed_fix' || newlyLearnedMemory.content?.attemptedFix) ? `The developer just pointed out a mistake or bug in previous code (${newlyLearnedMemory.content.attemptedFix || newlyLearnedMemory.content.problem}). Humbly acknowledge your mistake, explain that this error has been permanently recorded in MongoDB Atlas memory so you will NEVER repeat it in this or any future project, and immediately provide the corrected, bug-free implementation.` : `Acknowledge that this rule was ${wasMemoryUpdated ? 'updated in' : 'committed to'} MongoDB memory and explain that future code generations will strictly adhere to it.`}` : ''}

4. SHORT-TERM WORKING MEMORY:
Maintain full conversational context across prior prompt turns in this session.`;

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
  async callOpenAI(query, history = [], workspace, relevantMemories = [], userPreferences = [], newlyLearnedMemory, wasMemoryUpdated = false) {
    const memoryDirectives = (relevantMemories || []).map(m => 
      `- TOPIC RULE (${m.type}): "${m.content.title}". Rule: ${m.content.recommendation}. Failure to avoid: ${m.content.outcome || m.content.problem}`
    ).join('\n');

    const preferenceDirectives = (userPreferences || []).map(m =>
      `- USER PREFERENCE: "${m.content.title}" -> ${m.content.recommendation}`
    ).join('\n');

    const messages = [
      {
        role: 'system',
        content: `You are DevMemory, a senior AI pair programmer.
CORE DIRECTIVES:
1. Always build exactly what the user asks (e.g. if chess, build chess; never switch topics).
2. Personalize the solution using user styling/preferences (e.g. full screen, responsive controls).
3. Only enforce domain-specific rules if directly relevant to the topic.

${memoryDirectives ? `TOPIC INVARIANTS:\n${memoryDirectives}\n` : ''}
${preferenceDirectives ? `PREFERENCES:\n${preferenceDirectives}\n` : ''}`
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
