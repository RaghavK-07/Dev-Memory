import React, { useState } from 'react';
import { Send, Check, Copy, ShieldAlert, Sparkles, PlusCircle, Terminal, Layers, CheckCircle2 } from 'lucide-react';

export default function AgentSession({
  workspace,
  onInspectMemory,
  onOpenRecordModal
}) {
  const [inputQuery, setInputQuery] = useState('');
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      sender: 'agent',
      text: `Hello! I am DevMemory, your AI pair programmer for **\`${workspace}\`**.

I work like a standard coding assistant, but with **persistent memory in MongoDB Atlas**. 
- Whenever you encounter an issue that has failed in the past, I will **automatically rectify it** in the code I generate.
- You can teach me new invariants anytime by saying *"Remember that..."* or clicking **Teach Bug / Rule**.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      behaviorNotice: null,
      recalledMemories: []
    }
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null);

  // Quick test prompts to verify normal + auto-rectifying behavior
  const quickPrompts = [
    { label: 'Test Auto-Rectify (Token Expiry)', text: 'How should we handle 401 token expiration in our auth middleware?' },
    { label: 'Test Auto-Rectify (Float Math)', text: 'How should I compute total price with discount and taxes for Stripe?' },
    { label: 'Teach AI New Rule', text: 'Remember that all database queries in this workspace must use connection timeouts of 5000ms.' },
    { label: 'Normal Coding Task', text: 'Write a TypeScript function to parse query parameters into a typed object.' }
  ];

  const handleSend = async (customQuery) => {
    const query = customQuery || inputQuery;
    if (!query.trim() || isSubmitting) return;

    const userMsg = {
      id: 'msg-' + Date.now(),
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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
          sessionId: 'session-live',
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
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          autoRectification: data.autoRectification,
          newlyLearnedMemory: data.newlyLearnedMemory,
          recalledMemories: data.recalledMemories || []
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
          text: `Error communicating with DevMemory: ${err.message}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isError: true
        }
      ]);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyCode = (code, idx) => {
    navigator.clipboard.writeText(code);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="flex flex-col h-[740px] bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      
      {/* Session Header */}
      <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span className="text-xs font-semibold text-slate-800">AI Coding Assistant</span>
          <span className="text-[11px] font-mono text-slate-500">• {workspace}</span>
        </div>

        <button
          onClick={onOpenRecordModal}
          className="text-xs font-medium text-slate-600 hover:text-slate-900 transition flex items-center gap-1.5"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          <span>Teach Bug / Rule</span>
        </button>
      </div>

      {/* Message List */}
      <div className="flex-1 p-5 overflow-y-auto space-y-4 bg-[#fcfdfe]">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
          >
            {/* Header label */}
            <div className="flex items-center gap-2 mb-1 px-1 text-[11px] text-slate-400">
              <span className="font-medium text-slate-600">
                {msg.sender === 'user' ? 'You' : 'DevMemory'}
              </span>
              <span>{msg.timestamp}</span>
            </div>

            {/* Bubble */}
            <div
              className={`max-w-[92%] rounded-xl p-4 text-xs leading-relaxed ${
                msg.sender === 'user'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : msg.isError
                  ? 'bg-red-50 border border-red-200 text-red-800'
                  : 'bg-white border border-slate-200 text-slate-800 shadow-sm'
              }`}
            >
              {/* Newly Learned Memory Callout */}
              {msg.newlyLearnedMemory && (
                <div className="mb-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-[11px] block text-emerald-800">
                        Committed to Memory (MongoDB Atlas)
                      </span>
                      <span className="text-[11px] text-emerald-950 font-medium">
                        "{msg.newlyLearnedMemory.content.title}"
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => onInspectMemory(msg.newlyLearnedMemory._id)}
                    className="text-[10px] font-mono font-medium text-emerald-700 underline"
                  >
                    View in Hub →
                  </button>
                </div>
              )}

              {/* Automatic Rectification Callout */}
              {msg.autoRectification && (
                <div className="mb-3.5 p-3 rounded-lg bg-amber-50/80 border border-amber-200 text-amber-900">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 text-amber-700 flex-shrink-0" />
                      <span className="font-semibold text-[11px] uppercase tracking-wider text-amber-800">
                        Auto-Rectified from Memory
                      </span>
                    </div>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                      {(msg.autoRectification.score * 100).toFixed(1)}% match
                    </span>
                  </div>

                  <p className="text-[11px] text-amber-900 mt-1">
                    <strong>Enforced Rule:</strong> {msg.autoRectification.title}
                  </p>

                  <div className="mt-2 pt-2 border-t border-amber-200/60 flex items-center justify-between">
                    <button
                      onClick={() => onInspectMemory(msg.autoRectification.memoryId)}
                      className="text-[11px] font-mono font-medium text-amber-800 hover:text-amber-950 underline flex items-center gap-1"
                    >
                      Inspect Memory #{msg.autoRectification.memoryId.toString().slice(-6)} in Database →
                    </button>
                  </div>
                </div>
              )}

              {/* Message Content with Code Parsing */}
              <div className="whitespace-pre-wrap font-sans space-y-2">
                {msg.text.split('```').map((part, idx) => {
                  if (idx % 2 === 1) {
                    const lines = part.split('\n');
                    const lang = lines[0].trim();
                    const code = lines.slice(1).join('\n');
                    return (
                      <div key={idx} className="my-2.5 rounded-lg bg-slate-900 border border-slate-800 overflow-hidden font-mono text-[11px]">
                        <div className="px-3 py-1 bg-slate-800/80 border-b border-slate-800 text-[10px] text-slate-400 flex items-center justify-between">
                          <span className="uppercase">{lang || 'code'}</span>
                          <button
                            onClick={() => handleCopyCode(code || part, idx)}
                            className="flex items-center gap-1 hover:text-slate-200 transition"
                          >
                            {copiedIndex === idx ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span className="text-emerald-400">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        </div>
                        <pre className="p-3 overflow-x-auto text-emerald-300 leading-relaxed">
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
          <div className="flex items-center gap-2 text-slate-400 text-xs font-mono p-2">
            <div className="w-3.5 h-3.5 border-2 border-slate-700 border-t-transparent rounded-full animate-spin"></div>
            <span>Checking persistent memories in MongoDB Atlas...</span>
          </div>
        )}
      </div>

      {/* Suggested Quick Prompts */}
      <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 flex items-center gap-2 overflow-x-auto">
        <span className="text-[10px] font-mono text-slate-400 flex-shrink-0">Try asking:</span>
        {quickPrompts.map((p, i) => (
          <button
            key={i}
            onClick={() => handleSend(p.text)}
            disabled={isSubmitting}
            className="px-2.5 py-1 rounded bg-white hover:bg-slate-100 border border-slate-200 text-[11px] text-slate-700 transition flex-shrink-0 whitespace-nowrap shadow-2xs"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Input Form */}
      <div className="p-3.5 bg-white border-t border-slate-200">
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
            placeholder={`Ask DevMemory anything or say "Remember that..." to teach a rule...`}
            disabled={isSubmitting}
            className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 focus:bg-white transition"
          />
          <button
            type="submit"
            disabled={isSubmitting || !inputQuery.trim()}
            className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs transition flex items-center gap-1.5 disabled:opacity-40"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Send</span>
          </button>
        </form>
      </div>

    </div>
  );
}
