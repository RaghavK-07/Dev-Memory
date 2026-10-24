import React, { useState } from 'react';
import { Send, AlertTriangle, ShieldCheck, Zap, History, RefreshCcw, Sparkles, Terminal, Code2, CheckCircle2 } from 'lucide-react';

export default function AgentSession({
  workspace,
  onInspectMemory,
  onTriggerMistake,
  onTriggerCorrection,
  onTriggerEphemeral,
  loading
}) {
  const [sessionMode, setSessionMode] = useState('session-2'); // 'session-1' (past) or 'session-2' (new)
  const [inputQuery, setInputQuery] = useState('');
  const [messages, setMessages] = useState([
    {
      id: 'welcome-1',
      sender: 'agent',
      text: `Hello! I am **DevMemory**, your persistent AI pair programmer for **\`${workspace}\`**.

I retain real-time knowledge of past bugs, failed fixes, coding conventions, and architectural constraints stored in **MongoDB Atlas**. When you ask questions or propose fixes, I actively cross-reference our memory graph using **MongoDB Vector Search** to prevent repeating past mistakes.

Try asking one of the suggested prompts below or run a demo scenario!`,
      timestamp: new Date().toLocaleTimeString(),
      recalled: null
    }
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Suggested prompts per workspace
  const suggestions = {
    'auth-service': [
      {
        title: 'Fix 15-min JWT token timeout',
        query: 'Users keep getting 401 Unauthorized errors after 15 minutes due to expired tokens in auth middleware. How should we fix this?'
      },
      {
        title: 'User password hashing implementation',
        query: 'How should we hash user passwords in the authentication registration flow?'
      },
      {
        title: 'Query session without auth context',
        query: 'Can we read user profile directly from req.headers["x-user-id"]?'
      }
    ],
    'payment-gateway': [
      {
        title: 'Calculate order taxes & discounts',
        query: 'How should I compute total price including tax and discounts for Stripe charges?'
      },
      {
        title: 'Handle Stripe charge retry webhook',
        query: 'How do we handle duplicate Stripe charge retry webhooks in our endpoint?'
      }
    ],
    'checkout-api': [
      {
        title: 'Load test cache bypass',
        query: 'How can we test database throughput by bypassing cache during load tests?'
      }
    ]
  };

  const handleSend = async (queryToSend) => {
    const query = queryToSend || inputQuery;
    if (!query.trim() || isSubmitting) return;

    const userMsg = {
      id: 'msg-' + Date.now(),
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString(),
      session: sessionMode
    };

    setMessages(prev => [...prev, userMsg]);
    setInputQuery('');
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          sessionId: sessionMode === 'session-2' ? 'session-dev-later' : 'session-dev-initial',
          workspace,
          role: 'developer'
        })
      });

      const data = await response.json();

      if (data.success) {
        const agentMsg = {
          id: 'agent-' + Date.now(),
          sender: 'agent',
          text: data.response,
          timestamp: new Date().toLocaleTimeString(),
          behaviorNotice: data.behaviorChangeNotice,
          recalledMemories: data.recalledMemories,
          session: sessionMode
        };
        setMessages(prev => [...prev, agentMsg]);
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          id: 'err-' + Date.now(),
          sender: 'agent',
          text: `⚠️ Error contacting DevMemory agent: ${err.message}`,
          timestamp: new Date().toLocaleTimeString(),
          isError: true
        }
      ]);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      
      {/* Left Chat Window (3 cols) */}
      <div className="lg:col-span-3 flex flex-col h-[760px] bg-slate-900/60 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
        
        {/* Chat Header Bar */}
        <div className="px-5 py-3.5 bg-slate-950/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-mongo-slate flex items-center justify-center border border-mongo-green/30">
              <Terminal className="w-4 h-4 text-mongo-green" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-white">Active Session Console</span>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-800 text-slate-300">
                  {workspace}
                </span>
              </div>
              <p className="text-xs text-slate-400">MongoDB Vector Search & Recall Hook Enabled</p>
            </div>
          </div>

          {/* Session Switcher (Demonstrating Session Persistence) */}
          <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setSessionMode('session-1')}
              className={`px-3 py-1 text-xs rounded-lg font-medium transition flex items-center gap-1.5 ${
                sessionMode === 'session-1'
                  ? 'bg-amber-950/80 text-amber-300 border border-amber-600/40 shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Session #1 (Past)</span>
            </button>
            <button
              onClick={() => setSessionMode('session-2')}
              className={`px-3 py-1 text-xs rounded-lg font-medium transition flex items-center gap-1.5 ${
                sessionMode === 'session-2'
                  ? 'bg-emerald-950/80 text-mongo-green border border-mongo-green/40 shadow font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Session #2 (New Session)</span>
            </button>
          </div>
        </div>

        {/* Message Thread */}
        <div className="flex-1 p-5 overflow-y-auto space-y-5">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
            >
              {/* Sender label */}
              <div className="flex items-center gap-2 mb-1 px-1">
                <span className="text-xs font-medium text-slate-400">
                  {msg.sender === 'user' ? 'You (Developer)' : 'DevMemory Agent'}
                </span>
                <span className="text-[11px] text-slate-500 font-mono">{msg.timestamp}</span>
              </div>

              {/* Message Bubble */}
              <div
                className={`max-w-[92%] rounded-2xl p-4 sm:p-5 text-sm leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-blue-600/90 text-white shadow-md shadow-blue-900/20 rounded-tr-none'
                    : msg.isError
                    ? 'bg-red-950/60 border border-red-800 text-red-200 rounded-tl-none'
                    : 'bg-slate-950 border border-slate-800/80 text-slate-200 rounded-tl-none shadow-lg'
                }`}
              >
                {/* Behavioral Change Spotlight Banner */}
                {msg.behaviorNotice && (
                  <div className="mb-4 p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-200">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                        <span className="font-bold text-xs uppercase tracking-wider text-amber-300">
                          {msg.behaviorNotice.type === 'PREVENTED_FAILED_FIX'
                            ? 'Prior Failed Fix Recalled — Behavior Visibly Changed'
                            : 'Project Constraint Enforced'}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-900/60 text-amber-200">
                        Match: {(msg.behaviorNotice.score * 100).toFixed(1)}%
                      </span>
                    </div>
                    <p className="text-xs text-amber-100/90">
                      <strong>Memory cited:</strong> {msg.behaviorNotice.title}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        onClick={() => onInspectMemory(msg.behaviorNotice.memoryId)}
                        className="text-xs font-mono text-mongo-green hover:underline flex items-center gap-1"
                      >
                        Inspect MongoDB Document <span>→</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Recalled Memory Badges */}
                {msg.recalledMemories && msg.recalledMemories.length > 0 && !msg.behaviorNotice && (
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {msg.recalledMemories.map(m => (
                      <button
                        key={m.id}
                        onClick={() => onInspectMemory(m.id)}
                        className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-mongo-green/30 text-mongo-green text-xs font-mono flex items-center gap-1"
                      >
                        <ShieldCheck className="w-3 h-3" />
                        <span>{m.title.slice(0, 32)}...</span>
                        <span className="text-[10px] text-slate-400">({(m.relevanceScore * 100).toFixed(0)}%)</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Body Content */}
                <div className="whitespace-pre-wrap font-sans space-y-2">
                  {msg.text.split('```').map((part, idx) => {
                    if (idx % 2 === 1) {
                      // Code block
                      const lines = part.split('\n');
                      const lang = lines[0].trim();
                      const code = lines.slice(1).join('\n');
                      return (
                        <div key={idx} className="my-3 rounded-xl bg-slate-900/90 border border-slate-800 overflow-hidden font-mono text-xs">
                          {lang && (
                            <div className="px-3 py-1 bg-slate-800/60 border-b border-slate-800 text-[11px] text-slate-400 flex items-center gap-1.5">
                              <Code2 className="w-3.5 h-3.5 text-mongo-green" />
                              <span>{lang}</span>
                            </div>
                          )}
                          <pre className="p-3.5 overflow-x-auto text-emerald-300 leading-relaxed">
                            {code || part}
                          </pre>
                        </div>
                      );
                    }
                    return <span key={idx}>{part}</span>;
                  })}
                </div>
              </div>
            </div>
          ))}

          {isSubmitting && (
            <div className="flex items-center gap-3 text-slate-400 text-xs font-mono p-2">
              <div className="w-4 h-4 border-2 border-mongo-green border-t-transparent rounded-full animate-spin"></div>
              <span>Querying MongoDB Vector Search & cross-referencing memories...</span>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div className="p-4 bg-slate-950 border-t border-slate-800">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder={`Ask DevMemory in ${workspace} (e.g., "How should we handle token expiry?")...`}
              disabled={isSubmitting}
              className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-mongo-green transition"
            />
            <button
              type="submit"
              disabled={isSubmitting || !inputQuery.trim()}
              className="px-4 py-2.5 rounded-xl bg-mongo-green hover:bg-emerald-400 text-black font-semibold text-sm transition flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-mongo-green/20"
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">Send</span>
            </button>
          </form>
        </div>

      </div>

      {/* Right Controls Panel (1 col) */}
      <div className="space-y-6">
        
        {/* Suggested Prompts */}
        <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-5 shadow-lg">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-mongo-green" />
            <h3 className="text-sm font-semibold text-white">Suggested Prompts</h3>
          </div>
          <p className="text-xs text-slate-400 mb-3">
            Click to test semantic recall in <strong>{workspace}</strong>:
          </p>
          <div className="space-y-2">
            {(suggestions[workspace] || suggestions['auth-service']).map((item, i) => (
              <button
                key={i}
                onClick={() => handleSend(item.query)}
                disabled={isSubmitting}
                className="w-full text-left p-2.5 rounded-xl bg-slate-950/80 hover:bg-slate-850 hover:border-mongo-green/40 border border-slate-800/80 text-xs transition group"
              >
                <div className="font-medium text-slate-200 group-hover:text-mongo-green transition">
                  {item.title}
                </div>
                <div className="text-[11px] text-slate-400 truncate mt-0.5">
                  {item.query}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Quick Demo Triggers */}
        <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-5 shadow-lg">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-white">Interactive Triggers</h3>
          </div>
          <p className="text-xs text-slate-400 mb-3">
            Trigger key challenge actions to see real-time updates:
          </p>

          <div className="space-y-2.5">
            {/* Act 1: Simulate Mistake */}
            <button
              onClick={onTriggerMistake}
              disabled={loading}
              className="w-full text-left p-3 rounded-xl bg-gradient-to-r from-red-950/40 to-slate-950 border border-red-800/40 hover:border-red-600/60 transition group"
            >
              <div className="flex items-center justify-between text-xs font-semibold text-red-300">
                <span>1. Simulate Failed Fix</span>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-red-900/60">Act 1</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Simulate auth test failure & record <code className="text-red-300">failed_fix</code> in MongoDB.
              </p>
            </button>

            {/* Act 4: Supersede Constraint */}
            <button
              onClick={onTriggerCorrection}
              disabled={loading}
              className="w-full text-left p-3 rounded-xl bg-gradient-to-r from-blue-950/40 to-slate-950 border border-blue-800/40 hover:border-blue-600/60 transition group"
            >
              <div className="flex items-center justify-between text-xs font-semibold text-blue-300">
                <span>2. Supersede with Redis</span>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-blue-900/60">Act 4</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Resolve conflict: supersede old JWT memory with new Redis session constraint.
              </p>
            </button>

            {/* Act 4: Ephemeral TTL */}
            <button
              onClick={onTriggerEphemeral}
              disabled={loading}
              className="w-full text-left p-3 rounded-xl bg-gradient-to-r from-emerald-950/40 to-slate-950 border border-emerald-800/40 hover:border-emerald-600/60 transition group"
            >
              <div className="flex items-center justify-between text-xs font-semibold text-emerald-300">
                <span>3. Create TTL Memory (30s)</span>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-emerald-900/60">Act 4</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Insert temporary memory with MongoDB TTL index automatic purge.
              </p>
            </button>
          </div>
        </div>

      </div>

    </div>
  );
}
