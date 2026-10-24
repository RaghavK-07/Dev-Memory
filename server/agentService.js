/**
 * Agent Reasoning & Memory Orchestration Service
 * Connects developer requests to MongoDB Vector Search, determines behavioral changes,
 * prevents repeated mistakes, handles conflict superseding, and tracks recalls.
 */

const memoryRepo = require('./memoryModel');

class AgentService {
  /**
   * Process a developer query in a given session
   */
  async processQuery({ query, sessionId, workspace = 'auth-service', role = 'developer' }) {
    const timestamp = new Date();

    // 1. Semantic Recall via MongoDB Vector Search
    const recalledMemories = await memoryRepo.vectorSearch({
      query,
      workspace,
      status: 'active',
      limit: 3,
      minScore: 0.45
    });

    // 2. Track recalls in MongoDB
    for (const mem of recalledMemories) {
      await memoryRepo.recordRecall(mem._id, sessionId, query, mem.relevanceScore);
    }

    // 3. Inspect recalled memories to determine behavioral modifications
    const failedFixes = recalledMemories.filter(m => m.type === 'failed_fix');
    const constraints = recalledMemories.filter(m => m.type === 'constraint');
    const conventions = recalledMemories.filter(m => m.type === 'convention');
    const architectures = recalledMemories.filter(m => m.type === 'architecture');

    // 4. Synthesize Agent Response with Visible Memory Citations
    let agentResponse = '';
    let behaviorChangeNotice = null;

    const queryLower = query.toLowerCase();

    if (failedFixes.length > 0 && (queryLower.includes('token') || queryLower.includes('jwt') || queryLower.includes('expir') || queryLower.includes('fix') || queryLower.includes('auth'))) {
      const primaryFail = failedFixes[0];
      
      behaviorChangeNotice = {
        type: 'PREVENTED_FAILED_FIX',
        memoryId: primaryFail._id,
        title: primaryFail.content.title,
        attempted: primaryFail.content.attemptedFix,
        outcome: primaryFail.content.outcome,
        score: primaryFail.relevanceScore,
        workspace: primaryFail.workspace
      };

      agentResponse = `### ⚠️ DevMemory Alert: Avoid Prior Failed Fix!

I retrieved **Memory \`#${primaryFail._id.toString().slice(-6)}\`** from workspace **\`${primaryFail.workspace}\`** (Relevance: **${(primaryFail.relevanceScore * 100).toFixed(1)}%**).

> **Prior Failure Recorded:**
> In a previous session, we attempted:
> \`${primaryFail.content.attemptedFix}\`
> ❌ **Why it failed:** ${primaryFail.content.outcome}

---

###  Recommended Safe Architecture:
${primaryFail.content.recommendation}

${primaryFail.content.codeSnippet ? `\`\`\`typescript\n${primaryFail.content.codeSnippet}\n\`\`\`` : ''}

**Key Invariant:** Never let client clocks or requests dictate cryptographic token signatures. Always issue opaque refresh tokens or server-side sliding sessions.`;

    } else if (constraints.length > 0) {
      const topConstraint = constraints[0];

      behaviorChangeNotice = {
        type: 'ENFORCED_CONSTRAINT',
        memoryId: topConstraint._id,
        title: topConstraint.content.title,
        recommendation: topConstraint.content.recommendation,
        score: topConstraint.relevanceScore
      };

      agentResponse = `### 🔒 Project Constraint Enforced: ${topConstraint.content.title}

Recalled active constraint **\`#${topConstraint._id.toString().slice(-6)}\`** (Relevance: **${(topConstraint.relevanceScore * 100).toFixed(1)}%**):

> ${topConstraint.content.recommendation}

${topConstraint.content.codeSnippet ? `\`\`\`typescript\n${topConstraint.content.codeSnippet}\n\`\`\`` : ''}

All code generated for **\`${workspace}\`** automatically complies with this rule.`;

    } else {
      // General response when no specific constraint/failed_fix triggers
      agentResponse = `### DevMemory Analysis for \`${workspace}\`

No prior failures or blocking constraints matched your query with high confidence.

**General Guidance for:** "${query}"
- Follow standardized modular patterns.
- Ensure all async handlers handle uncaught rejections.
- Maintain idempotency and audit logs for sensitive operations.

*(DevMemory is monitoring this interaction. If a chosen solution fails tests or review, record it to ensure the agent never suggests it again.)*`;
    }

    return {
      sessionId,
      workspace,
      query,
      timestamp,
      response: agentResponse,
      behaviorChangeNotice,
      recalledMemories: recalledMemories.map(m => ({
        id: m._id,
        type: m.type,
        title: m.content.title,
        relevanceScore: m.relevanceScore,
        retrievalMethod: m.retrievalMethod,
        attemptedFix: m.content.attemptedFix,
        outcome: m.content.outcome,
        recommendation: m.content.recommendation,
        status: m.lifecycle.status,
        supersededBy: m.lifecycle.supersededBy,
        recallsCount: (m.recallStats?.recallsCount || 0) + 1
      }))
    };
  }

  /**
   * Simulate Act 1: The Costly Mistake
   * Demonstrates an attempted fix that fails tests, prompting DevMemory to record a failed_fix memory
   */
  async simulateMistake({ workspace = 'auth-service', sessionId = 'session-act-1' }) {
    const memoryData = {
      owner: 'agent-devmemory',
      workspace: workspace,
      type: 'failed_fix',
      content: {
        title: 'Client-side JWT re-signing causes replay attack & test failures',
        problem: 'Users frequently face sudden 401 Unauthorized errors when JWT access tokens expire after 15 minutes during active usage.',
        attemptedFix: 'Allow client middleware to re-sign and extend token expiry timestamp on outgoing requests.',
        outcome: 'Security audit test failure: Replay attack vulnerability! In addition, clock skew between client and server caused 403 Forbidden token signature mismatch.',
        recommendation: 'Implement server-managed Sliding Session with Rotating Refresh Tokens stored in HttpOnly Secure SameSite cookies. The client never touches token signatures.',
        codeSnippet: `// ❌ FAILED FIX ATTEMPT (DO NOT USE):
// client.interceptors.request.use((req) => {
//   token.exp = Date.now() + 3600; // Client-side manipulation!
//   return req;
// });

//  CORRECT VERIFIED PATTERN:
app.post('/api/auth/refresh', async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  const session = await verifyAndRotateRefreshToken(refreshToken);
  res.cookie('refreshToken', session.newRefreshToken, { httpOnly: true, secure: true });
  res.json({ accessToken: session.newAccessToken });
});`,
        affectedFiles: ['src/middleware/auth.ts', 'src/services/tokenService.ts', 'tests/auth.test.ts']
      },
      source: {
        sessionId: sessionId,
        channel: 'ci_pipeline_failure',
        author: 'Security Regression Suite'
      },
      lifecycle: {
        status: 'active',
        confidence: 0.98,
        tags: ['auth', 'jwt', 'security', 'token-expiry', 'replay-attack']
      }
    };

    const created = await memoryRepo.createMemory(memoryData);
    return {
      success: true,
      action: 'MISTAKE_RECORDED',
      message: 'Failed fix captured and stored in MongoDB Atlas memories collection!',
      memory: created
    };
  }

  /**
   * Simulate Act 4: Constraint Correction & Conflict Resolution
   * Demonstrates superseding an old memory when architecture shifts
   */
  async simulateCorrection({
    oldMemoryTitle = 'Client-side JWT',
    newConstraint = 'Migrated to Redis Distributed Session Store. Stateless JWT refresh tokens are deprecated; use Redis sliding session TTL.'
  }) {
    // 1. Locate the existing active memory to supersede
    const existing = await memoryRepo.listMemories({
      workspace: 'auth-service',
      status: 'active'
    });

    const targetMemory = existing.find(m => 
      m.content.title.toLowerCase().includes('jwt') || 
      m.content.title.toLowerCase().includes('client-side')
    ) || existing[0];

    if (!targetMemory) {
      throw new Error('No active memory found to supersede. Run the mistake simulation first.');
    }

    // 2. Prepare new constraint memory
    const newMemoryData = {
      owner: 'tech-lead-alex',
      workspace: targetMemory.workspace,
      type: 'constraint',
      content: {
        title: 'Architecture Invariant: Redis Session Store with Sliding TTL',
        problem: 'Stateless JWT refresh token complexity replaced by centralized Redis session store.',
        attemptedFix: 'Replaced stateless JWT rotation with server-side Redis session ID store.',
        outcome: 'Single point of revocation achieved; instant session invalidation and zero clock-skew bugs.',
        recommendation: newConstraint,
        codeSnippet: `//  NEW MANDATED CONSTRAINT:
const session = await redisClient.get(\`session:\${sessionId}\`);
if (!session) throw new UnauthorizedException('Session expired');
// Slide session expiry by 30 mins on active traffic
await redisClient.expire(\`session:\${sessionId}\`, 1800);`,
        affectedFiles: ['src/config/redis.ts', 'src/middleware/session.ts']
      },
      source: {
        sessionId: 'session-arch-decision',
        channel: 'architecture_decision_record',
        author: 'Lead Architect'
      },
      lifecycle: {
        status: 'active',
        confidence: 1.0,
        tags: ['architecture', 'redis', 'session', 'sliding-ttl', 'constraint']
      }
    };

    // 3. Supersede in MongoDB
    const result = await memoryRepo.supersedeMemory(
      targetMemory._id,
      newMemoryData,
      'Architectural shift: Stateless JWT replaced by Redis centralized session store'
    );

    return {
      success: true,
      action: 'MEMORY_SUPERSEDED',
      supersededMemoryId: targetMemory._id,
      newMemoryId: result.newMemory._id,
      reason: result.reason,
      newMemory: result.newMemory
    };
  }

  /**
   * Simulate Act 4: TTL Expiry
   * Creates an ephemeral memory with a 30s TTL
   */
  async simulateEphemeral({ workspace = 'auth-service', ttlSeconds = 30 }) {
    const data = {
      owner: 'debug-agent-probe',
      workspace,
      type: 'decision',
      content: {
        title: `Ephemeral Debug Flag: Trial Profiler Tracer [Expires in ${ttlSeconds}s]`,
        problem: 'Temporary tracing enabled for diagnosing high latency in token verification.',
        attemptedFix: 'Enable verbose packet inspection on port 8080.',
        outcome: 'Diagnostic trace captured.',
        recommendation: `This memory is time-limited (${ttlSeconds}s). MongoDB TTL index will automatically purge it once expired.`,
        codeSnippet: `// Ephemeral flag automatically removed by MongoDB TTL:
console.time('token-verify-latency');`,
        affectedFiles: ['src/debug/profiler.ts']
      },
      source: {
        sessionId: 'session-debug-ephemeral',
        channel: 'debug_profiler',
        author: 'Profiler Diagnostic'
      },
      lifecycle: {
        status: 'active',
        confidence: 0.7,
        tags: ['ephemeral', 'ttl-demo', 'debug']
      }
    };

    const created = await memoryRepo.createEphemeralMemory(data, ttlSeconds);
    return {
      success: true,
      action: 'EPHEMERAL_MEMORY_CREATED',
      ttlSeconds,
      expiresAt: created.lifecycle.expiresAt,
      memory: created
    };
  }
}

module.exports = new AgentService();
