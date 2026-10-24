/**
 * Seed Script for DevMemory
 * Populates MongoDB Atlas with production-like memories across multiple workspaces
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const dbManager = require('./db');
const memoryRepo = require('./memoryModel');

const SEED_MEMORIES = [
  // 1. Auth Service - The Classic Failed Fix (Act 1 / Act 2 foundation)
  {
    owner: 'agent-devmemory',
    workspace: 'auth-service',
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
      sessionId: 'session-auth-101',
      channel: 'ci_pipeline_failure',
      author: 'Security Regression Suite'
    },
    lifecycle: {
      status: 'active',
      confidence: 0.98,
      tags: ['auth', 'jwt', 'security', 'token-expiry', 'replay-attack']
    }
  },

  // 2. Auth Service - Coding Convention
  {
    owner: 'security-team',
    workspace: 'auth-service',
    type: 'convention',
    content: {
      title: 'Argon2id password hashing parameters and salt rounds',
      problem: 'Legacy bcrypt was vulnerable to GPU-accelerated dictionary attacks and lacked memory hardness.',
      attemptedFix: 'Upgraded all credential ingestion pipelines to Argon2id with recommended OWASP parameters.',
      outcome: 'Passed SOC-2 compliance requirement for password storage hardening.',
      recommendation: 'Always use argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 }). Never use plain SHA-256 or un-salted bcrypt.',
      codeSnippet: `import argon2 from 'argon2';

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4
  });
}`,
      affectedFiles: ['src/utils/crypto.ts']
    },
    source: {
      sessionId: 'session-security-audit',
      channel: 'pr_review',
      author: 'Security Lead'
    },
    lifecycle: {
      status: 'active',
      confidence: 1.0,
      tags: ['password', 'crypto', 'argon2id', 'security-convention']
    }
  },

  // 3. Payment Gateway - Failed Float Math Fix
  {
    owner: 'dev-agent-02',
    workspace: 'payment-gateway',
    type: 'failed_fix',
    content: {
      title: 'Floating-point math in tax and discount calculation causes penny-rounding bugs',
      problem: 'Stripe rejected charge requests with 400 Bad Request: "Amount must convert to whole cents without fractional decimals".',
      attemptedFix: 'Calculated order totals directly with standard JavaScript numbers: let total = subtotal * (1 + taxRate) - discount;',
      outcome: 'JavaScript IEEE-754 precision error produced values like 19.990000000000002, triggering checkout crash and accounting discrepancy.',
      recommendation: 'Store and calculate all currency in integer smallest currency units (cents/satoshis). Perform division at the very final presentation layer only.',
      codeSnippet: `// ❌ FAILED FIX:
// const total = (price * 1.0825).toFixed(2); // String coercion bugs

//  CORRECT PATTERN:
function calculateTotalCents(priceCents: number, taxRateBps: number): number {
  return Math.round(priceCents + (priceCents * taxRateBps) / 10000);
}`,
      affectedFiles: ['src/billing/calculator.ts', 'src/gateways/stripe.ts']
    },
    source: {
      sessionId: 'session-billing-204',
      channel: 'production_incident',
      author: 'Billing SRE'
    },
    lifecycle: {
      status: 'active',
      confidence: 0.99,
      tags: ['payments', 'stripe', 'math-precision', 'currency', 'rounding']
    }
  },

  // 4. Payment Gateway - Idempotency Constraint
  {
    owner: 'architecture-board',
    workspace: 'payment-gateway',
    type: 'constraint',
    content: {
      title: 'Mandatory Idempotency Keys on All Payment Mutation Endpoints',
      problem: 'Network retries from mobile clients caused duplicate credit card authorizations for single cart checkouts.',
      attemptedFix: 'Implemented Redis atomic SETNX with 24-hour expiration on Idempotency-Key header.',
      outcome: 'Zero duplicate charge incidents in last 180 days.',
      recommendation: 'Every POST /charges or refund endpoint MUST require the Idempotency-Key header. Check and claim in Redis before executing downstream payment gateway APIs.',
      codeSnippet: `export async function enforceIdempotency(key: string, handler: () => Promise<any>) {
  const acquired = await redis.set(\`idemp:\${key}\`, 'LOCKED', 'NX', 'EX', 86400);
  if (!acquired) {
    throw new ConflictException('Duplicate operation in-flight with key: ' + key);
  }
  return await handler();
}`,
      affectedFiles: ['src/middleware/idempotency.ts']
    },
    source: {
      sessionId: 'session-arch-301',
      channel: 'architecture_decision_record',
      author: 'Fintech Architect'
    },
    lifecycle: {
      status: 'active',
      confidence: 1.0,
      tags: ['idempotency', 'redis', 'payments', 'stripe', 'retry']
    }
  },

  // 5. Checkout API - Ephemeral Memory demonstrating TTL Index
  {
    owner: 'load-test-runner',
    workspace: 'checkout-api',
    type: 'decision',
    content: {
      title: 'Ephemeral Load Test Cache Bypass Flag [TTL 300s]',
      problem: 'Benchmarking database query latency without CDN and Redis caching layer.',
      attemptedFix: 'Temporarily injected BYPASS_CACHE header into test sessions.',
      outcome: 'Baseline query metrics collected: p99 = 42ms.',
      recommendation: 'This memory is ephemeral and will expire automatically via MongoDB TTL index.',
      codeSnippet: `const bypassCache = req.headers['x-bypass-cache'] === 'true';`,
      affectedFiles: ['src/services/cartService.ts']
    },
    source: {
      sessionId: 'session-perf-501',
      channel: 'load_test',
      author: 'Performance Bot'
    },
    lifecycle: {
      status: 'active',
      confidence: 0.8,
      expiresAt: new Date(Date.now() + 300 * 1000), // 5 minutes TTL
      tags: ['ephemeral', 'ttl-demo', 'load-test', 'checkout']
    }
  }
];

async function runSeed() {
  try {
    console.log('Connecting to MongoDB Atlas for seeding...');
    await dbManager.connect();

    console.log('Checking existing memories...');
    const count = await memoryRepo.collection.countDocuments();
    console.log(`Current memory count: ${count}`);

    if (count > 0) {
      console.log('Clearing existing memories to ensure a clean demo slate...');
      await memoryRepo.collection.deleteMany({});
    }

    console.log(`Inserting ${SEED_MEMORIES.length} seed memories...`);
    const inserted = [];
    for (const mem of SEED_MEMORIES) {
      const created = await memoryRepo.createMemory(mem);
      inserted.push(created);
      console.log(`✓ Inserted [${created.type}] ${created.content.title} (ID: ${created._id})`);
    }

    console.log('\nSeed completed successfully!');
    return inserted;
  } catch (err) {
    console.error('Seed failed:', err);
    throw err;
  }
}

if (require.main === module) {
  runSeed().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { runSeed, SEED_MEMORIES };

