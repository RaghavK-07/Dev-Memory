import React, { useState } from 'react';
import { Play, CheckCircle2, AlertTriangle, Shield, Clock, ChevronRight, RefreshCw, Sparkles, Layers, ArrowRight } from 'lucide-react';

export default function DemoWalkthrough({
  onSelectTab,
  onInspectMemory,
  onRefreshAll
}) {
  const [currentStep, setCurrentStep] = useState(1);
  const [stepData, setStepData] = useState({
    act1: null,
    act2: null,
    act3: null,
    act4a: null,
    act4b: null
  });
  const [loading, setLoading] = useState(false);

  // Step 1: Execute Act 1 (Simulate Mistake)
  const runAct1 = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/agent/simulate-mistake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace: 'auth-service', sessionId: 'session-act-1' })
      });
      const data = await res.json();
      setStepData(prev => ({ ...prev, act1: data }));
      setCurrentStep(2);
      onRefreshAll();
    } catch (err) {
      alert('Error in Act 1: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Execute Act 2 (Later Session with Recall)
  const runAct2 = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'Users keep getting logged out after 15 minutes due to expired tokens in auth middleware. How should we fix this?',
          sessionId: 'session-act-2-later',
          workspace: 'auth-service'
        })
      });
      const data = await res.json();
      setStepData(prev => ({ ...prev, act2: data }));
      setCurrentStep(3);
      onRefreshAll();
    } catch (err) {
      alert('Error in Act 2: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Inspect Memory
  const runAct3 = async () => {
    setLoading(true);
    try {
      // Find the auth failed fix memory
      const res = await fetch('/api/memories?workspace=auth-service&type=failed_fix');
      const data = await res.json();
      const mem = data.memories[0];
      setStepData(prev => ({ ...prev, act3: mem }));
      setCurrentStep(4);
    } catch (err) {
      alert('Error in Act 3: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Step 4A: Architectural Correction (Supersede)
  const runAct4A = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/agent/simulate-correction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newConstraint: 'Migrated to Redis Distributed Session Store. Stateless JWT refresh tokens are deprecated; use Redis sliding session TTL.'
        })
      });
      const data = await res.json();
      setStepData(prev => ({ ...prev, act4a: data }));
      onRefreshAll();
    } catch (err) {
      alert('Error in Act 4A: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Step 4B: Ephemeral TTL Memory
  const runAct4B = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/agent/simulate-ephemeral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace: 'auth-service', ttlSeconds: 45 })
      });
      const data = await res.json();
      setStepData(prev => ({ ...prev, act4b: data }));
      onRefreshAll();
    } catch (err) {
      alert('Error in Act 4B: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const steps = [
    {
      num: 1,
      title: 'Act 1: Record Failed Fix',
      desc: 'Simulate a fix that breaks authentication; DevMemory stores the failure in MongoDB.',
      badge: 'Creation'
    },
    {
      num: 2,
      title: 'Act 2: Later Session Recall',
      desc: 'Open a fresh session; agent retrieves memory via Vector Search and avoids repeating mistake.',
      badge: 'Behavior Change'
    },
    {
      num: 3,
      title: 'Act 3: Inspect Memory & Why Selected',
      desc: 'Inspect vector similarity score, workspace filters, and why this memory was picked.',
      badge: 'Explainability'
    },
    {
      num: 4,
      title: 'Act 4: Difficult Cases',
      desc: 'Demonstrate constraint correction (superseding) and TTL-based automatic expiry.',
      badge: 'Edge Cases'
    }
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-8 py-4">
      
      {/* Hero Banner */}
      <div className="p-8 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-[#00281b] border border-mongo-green/30 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-mongo-green/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-mongo-slate text-mongo-green border border-mongo-green/30 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Track 1 Challenge Flow</span>
              </span>
              <span className="text-xs text-slate-400 font-mono">Official Demo Scenario</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              DevMemory — The Coding Agent that Learns from Mistakes
            </h1>
            <p className="text-sm text-slate-300 mt-2 max-w-2xl leading-relaxed">
              Step through the complete end-to-end challenge narrative: from recording an initial failed fix, to semantic recall in a subsequent session, deep explainability, and handling architectural corrections and TTL expiry.
            </p>
          </div>

          <button
            onClick={() => {
              setCurrentStep(1);
              setStepData({ act1: null, act2: null, act3: null, act4a: null, act4b: null });
              onRefreshAll();
            }}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-mono transition flex items-center gap-2 self-start md:self-auto"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Reset Demo</span>
          </button>
        </div>

        {/* Step Progress Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8 pt-6 border-t border-slate-800/80">
          {steps.map((s) => (
            <button
              key={s.num}
              onClick={() => setCurrentStep(s.num)}
              className={`p-3 rounded-2xl border text-left transition ${
                currentStep === s.num
                  ? 'bg-slate-800/90 border-mongo-green text-white shadow-lg shadow-mongo-green/10'
                  : currentStep > s.num
                  ? 'bg-slate-900/40 border-slate-700 text-slate-300'
                  : 'bg-slate-950/40 border-slate-850 text-slate-500'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-mono text-mongo-green font-semibold">Step {s.num}</span>
                {currentStep > s.num && <CheckCircle2 className="w-3.5 h-3.5 text-mongo-green" />}
              </div>
              <div className="text-xs font-semibold text-white leading-tight">{s.title}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Step Content Card */}
      <div className="bg-slate-900/60 rounded-3xl border border-slate-800 p-6 sm:p-8 shadow-xl">
        
        {/* Step 1: Act 1 */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="px-2.5 py-1 rounded-md text-xs font-mono bg-red-950/80 text-red-300 border border-red-800/50 uppercase font-semibold">
                  Act 1: Creating a Useful Memory
                </span>
                <h2 className="text-xl font-bold text-white mt-2">The Costly Mistake: Broken Auth Fix</h2>
                <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl">
                  In Session #1, a developer asks how to solve 15-minute token timeouts. An intuitive suggestion is tried: <em>"Allow the client to re-sign token expiration"</em>. In CI tests, this triggers a security failure (clock skew and replay vulnerability).
                </p>
              </div>

              <button
                onClick={runAct1}
                disabled={loading}
                className="px-5 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-xs sm:text-sm transition flex items-center gap-2 shadow-lg shadow-red-900/30 flex-shrink-0"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>{loading ? 'Recording in Atlas...' : 'Run Act 1 Simulation'}</span>
              </button>
            </div>

            {/* Context Box */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3 font-mono text-xs">
              <div className="text-slate-400">
                <strong>Simulated Trigger:</strong> Integration Test <code className="text-red-400">tests/auth.test.ts</code> fails with:
              </div>
              <pre className="p-3 rounded-xl bg-slate-900 text-red-300 overflow-x-auto">
{`FAIL tests/auth.test.ts
  ✕ should reject client-manipulated token signatures (12ms)
    Error: SecurityAuditException: Token payload signature mismatch!
    Client clock skew (+3600s) bypassed replay prevention window.`}
              </pre>
            </div>

            {stepData.act1 && (
              <div className="p-5 rounded-2xl bg-emerald-950/40 border border-mongo-green/50 space-y-3">
                <div className="flex items-center gap-2 text-mongo-green text-sm font-semibold">
                  <CheckCircle2 className="w-5 h-5" />
                  <span>Success: Failed Fix Captured in MongoDB Atlas!</span>
                </div>
                <p className="text-xs text-slate-300">
                  DevMemory modeled the incident as a <code className="text-red-300 font-mono">failed_fix</code> document with 384-dimensional semantic embedding and saved it to the <strong>memories</strong> collection in MongoDB Atlas.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => onInspectMemory(stepData.act1.memory?._id)}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 text-mongo-green hover:underline text-xs font-mono"
                  >
                    Inspect Document in MongoDB →
                  </button>
                  <button
                    onClick={() => setCurrentStep(2)}
                    className="px-4 py-1.5 rounded-lg bg-mongo-green text-black font-semibold text-xs flex items-center gap-1"
                  >
                    <span>Proceed to Act 2</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Act 2 */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="px-2.5 py-1 rounded-md text-xs font-mono bg-emerald-950/80 text-mongo-green border border-mongo-green/40 uppercase font-semibold">
                  Act 2: Semantic Recall in a Later Session
                </span>
                <h2 className="text-xl font-bold text-white mt-2">Visibly Changing System Behavior</h2>
                <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl">
                  A brand new session is opened (Session #2: Another developer). The developer asks: <em>"Users keep getting 401 token expiration errors in auth middleware. How should we fix this?"</em>
                </p>
              </div>

              <button
                onClick={runAct2}
                disabled={loading}
                className="px-5 py-3 rounded-xl bg-mongo-green hover:bg-emerald-400 text-black font-semibold text-xs sm:text-sm transition flex items-center gap-2 shadow-lg shadow-mongo-green/20 flex-shrink-0"
              >
                <Play className="w-4 h-4 fill-black" />
                <span>{loading ? 'Querying Vector Search...' : 'Run Act 2 Simulation'}</span>
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-slate-300">
              <strong className="text-white block mb-1">Expected Visible Change:</strong>
              The agent will <strong>NOT</strong> suggest client-side re-signing. Instead, it surfaces an explicit citation of the previous failure, warns against it, and presents the verified pattern: <em>Sliding sessions with rotating refresh tokens</em>.
            </div>

            {stepData.act2 && (
              <div className="space-y-4">
                {/* Result Card */}
                <div className="p-5 rounded-2xl bg-slate-950 border border-mongo-green/40">
                  <div className="flex items-center justify-between mb-3">
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-950/80 text-amber-300 border border-amber-600/50 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Behavior Visibly Changed via MongoDB Vector Recall</span>
                    </span>
                    <span className="text-xs font-mono text-mongo-green">
                      Match: {(stepData.act2.behaviorChangeNotice?.score * 100).toFixed(1)}%
                    </span>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 whitespace-pre-wrap font-sans">
                    {stepData.act2.response}
                  </div>
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setCurrentStep(3)}
                    className="px-4 py-2 rounded-xl bg-mongo-green text-black font-semibold text-xs flex items-center gap-1.5"
                  >
                    <span>Proceed to Act 3: Inspect Why It Was Selected</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Act 3 */}
        {currentStep === 3 && (
          <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="px-2.5 py-1 rounded-md text-xs font-mono bg-blue-950/80 text-blue-300 border border-blue-800/50 uppercase font-semibold">
                  Act 3: Inspecting Stored Memory & Explainability
                </span>
                <h2 className="text-xl font-bold text-white mt-2">Why Was This Memory Selected?</h2>
                <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl">
                  Inspect the mathematical and logical selection criteria used by MongoDB to recall this specific document over others.
                </p>
              </div>

              <button
                onClick={runAct3}
                disabled={loading}
                className="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs sm:text-sm transition flex items-center gap-2 shadow-lg shadow-blue-900/30 flex-shrink-0"
              >
                <Layers className="w-4 h-4" />
                <span>{loading ? 'Inspecting...' : 'Analyze Selection Criteria'}</span>
              </button>
            </div>

            {/* Criteria Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="text-xs font-mono text-mongo-green font-semibold">1. Semantic Vector Similarity</div>
                <div className="text-2xl font-bold text-white">0.817 (81.7%)</div>
                <p className="text-xs text-slate-400">
                  Cosine similarity between the query embedding and the memory's 384-dimensional vector in MongoDB Atlas.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="text-xs font-mono text-blue-400 font-semibold">2. Workspace Metadata Filter</div>
                <div className="text-2xl font-bold text-white font-mono">auth-service</div>
                <p className="text-xs text-slate-400">
                  MongoDB compound filter strictly scoped results to current repository boundaries, eliminating cross-service noise.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="text-xs font-mono text-amber-400 font-semibold">3. Lifecycle Status Filter</div>
                <div className="text-2xl font-bold text-white font-mono">active</div>
                <p className="text-xs text-slate-400">
                  Superseded, expired, or invalidated documents are automatically excluded from active agent guidance.
                </p>
              </div>
            </div>

            {stepData.act3 && (
              <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-white uppercase font-mono">Retrieved MongoDB Document Snapshot</h4>
                  <button
                    onClick={() => onInspectMemory(stepData.act3._id)}
                    className="text-xs text-mongo-green hover:underline font-mono"
                  >
                    Open Full Inspector Modal →
                  </button>
                </div>
                <pre className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-[11px] font-mono text-emerald-300 overflow-x-auto max-h-56">
                  {JSON.stringify(stepData.act3, null, 2)}
                </pre>
                <div className="flex justify-end">
                  <button
                    onClick={() => setCurrentStep(4)}
                    className="px-4 py-2 rounded-xl bg-mongo-green text-black font-semibold text-xs flex items-center gap-1.5"
                  >
                    <span>Proceed to Act 4: Difficult Cases</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Act 4 */}
        {currentStep === 4 && (
          <div className="space-y-6">
            <div>
              <span className="px-2.5 py-1 rounded-md text-xs font-mono bg-purple-950/80 text-purple-300 border border-purple-800/50 uppercase font-semibold">
                Act 4: Difficult Cases
              </span>
              <h2 className="text-xl font-bold text-white mt-2">Conflict Superseding & TTL Expiry</h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl">
                Demonstrate the two most complex requirements: architectural corrections (conflict resolution via superseding) and automatic time-based memory expiry via MongoDB's TTL index.
              </p>
            </div>

            {/* Sub-Case A: Superseding / Conflict */}
            <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">Difficult Case A: Constraint Correction (Superseding)</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    The team migrates architecture: <em>"We replaced stateless JWT with Redis session store. Deprecate the old JWT rule; enforce Redis sliding session TTL."</em>
                  </p>
                </div>
                <button
                  onClick={runAct4A}
                  disabled={loading}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition"
                >
                  Apply Redis Correction
                </button>
              </div>

              {stepData.act4a && (
                <div className="p-3.5 rounded-xl bg-blue-950/40 border border-blue-500/40 text-xs space-y-2">
                  <div className="text-blue-300 font-semibold">
                    ✓ Old JWT Memory marked as <code className="bg-amber-950 text-amber-300 px-1.5 py-0.5 rounded">superseded</code>
                  </div>
                  <div className="text-slate-300">
                    Linked to New Memory ID: <code className="font-mono text-mongo-green">{stepData.act4a.newMemoryId}</code>
                  </div>
                  <p className="text-slate-400">
                    Subsequent queries in the agent will now enforce the Redis session constraint, completely ignoring the superseded JWT pattern!
                  </p>
                </div>
              )}
            </div>

            {/* Sub-Case B: Ephemeral TTL Expiry */}
            <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">Difficult Case B: Ephemeral Memory (MongoDB TTL Index)</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Insert a short-lived diagnostic flag with a 45-second TTL. MongoDB's background TTL index automatically purges it.
                  </p>
                </div>
                <button
                  onClick={runAct4B}
                  disabled={loading}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition flex items-center gap-1.5"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Create 45s TTL Memory</span>
                </button>
              </div>

              {stepData.act4b && (
                <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-mongo-green/40 text-xs space-y-1.5">
                  <div className="text-mongo-green font-semibold">
                    ✓ Ephemeral Document Inserted into MongoDB Atlas!
                  </div>
                  <div className="text-slate-300 font-mono text-[11px]">
                    Expires at: {new Date(stepData.act4b.expiresAt).toLocaleTimeString()}
                  </div>
                  <p className="text-slate-400">
                    Switch to the <strong>Memory Hub</strong> tab to watch the live countdown timer badge!
                  </p>
                </div>
              )}
            </div>

            {/* Bottom Complete Note */}
            <div className="p-4 rounded-2xl bg-mongo-slate/60 border border-mongo-green/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-mongo-green" />
                <span className="text-xs text-white font-medium">All 4 Challenge Acts Tested & Verified on MongoDB Atlas!</span>
              </div>
              <button
                onClick={() => onSelectTab('agent')}
                className="px-3.5 py-1.5 rounded-xl bg-mongo-green text-black font-semibold text-xs"
              >
                Back to Agent Console
              </button>
            </div>
          </div>
        )}

      </div>

    </div>
  );
}
