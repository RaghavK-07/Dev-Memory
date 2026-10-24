import React, { useState } from 'react';
import { Send, AlertCircle, ShieldAlert, Check, Copy, Code2, PlusCircle, Terminal, Layers } from 'lucide-react';

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
      text: `DevMemory is active for workspace \`${workspace}\`.

Every interaction is checked against persistent memories in MongoDB Atlas. If a proposed fix or pattern has failed in the past, DevMemory will explicitly prevent the failure and supply the verified solution.

If any suggested fix fails your tests, use the **Record Bug / Rule** button to ensure the assistant never repeats the mistake.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      behaviorNotice: null,
      recalledMemories: []
    }
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null);

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
          behaviorNotice: data.behaviorChangeNotice,
          recalledMemories: data.recalledMemories
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
          <span className="text-xs font-semibold text-slate-800">Pair Programming Console</span>
          <span className="text-[11px] font-mono text-slate-500">• {workspace}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenRecordModal}
            className="text-xs font-medium text-slate-600 hover:text-slate-900 transition flex items-center gap-1.5"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Teach Bug / Rule</span>
          </button>
        </div>
      </div>

      {/* Message List */}
      <div className="flex-1 p-5 overflow-y-auto space-y-5 bg-[#fcfdfe]">
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
              className={`max-w-[90%] rounded-xl p-4 text-xs leading-relaxed ${
                msg.sender === 'user'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : msg.isError
                  ? 'bg-red-50 border border-red-200 text-red-800'
                  : 'bg-white border border-slate-200 text-slate-800 shadow-sm'
              }`}
            >
              {/* Prior Failure Recalled Alert Banner */}
              {msg.behaviorNotice && (
                <div className="mb-3.5 p-3 rounded-lg bg-amber-50/70 border border-amber-200/80 text-amber-900">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 text-amber-700 flex-shrink-0" />
                      <span className="font-semibold text-[11px] uppercase tracking-wider text-amber-800">
                        {msg.behaviorNotice.type === 'PREVENTED_FAILED_FIX'
                          ? 'Prior Failure Invariant Detected'
                          : 'Mandatory Constraint Enforced'}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                      {(msg.behaviorNotice.score * 100).toFixed(1)}% match
                    </span>
                  </div>

                  <p className="text-[11px] text-amber-900 mt-1">
                    <strong>Rule:</strong> {msg.behaviorNotice.title}
                  </p>

                  <div className="mt-2 pt-2 border-t border-amber-200/60 flex items-center justify-between">
                    <button
                      onClick={() => onInspectMemory(msg.behaviorNotice.memoryId)}
                      className="text-[11px] font-mono font-medium text-amber-800 hover:text-amber-950 underline flex items-center gap-1"
                    >
                      View Memory Record in Database →
                    </button>
                  </div>
                </div>
              )}

              {/* Recalled Memory Reference Badges */}
              {msg.recalledMemories && msg.recalledMemories.length > 0 && !msg.behaviorNotice && (
                <div className="mb-2.5 flex flex-wrap gap-1.5">
                  {msg.recalledMemories.map(m => (
                    <button
                      key={m.id}
                      onClick={() => onInspectMemory(m.id)}
                      className="px-2 py-0.5 rounded bg-slate-50 hover:bg-slate-100 border border-slate-200 text-[10px] font-mono text-slate-700 flex items-center gap-1 transition"
                    >
                      <Layers className="w-3 h-3 text-slate-500" />
                      <span>{m.title.slice(0, 36)}...</span>
                      <span className="text-slate-400">({(m.relevanceScore * 100).toFixed(0)}%)</span>
                    </button>
                  ))}
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

              {/* Feedback to teach agent if it suggested something that failed */}
              {msg.sender === 'agent' && !msg.isError && (
                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Is this solution failing in your tests?</span>
                  <button
                    onClick={onOpenRecordModal}
                    className="text-slate-600 hover:text-slate-900 font-medium transition"
                  >
                    Teach Failure & Avoid in Future
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {isSubmitting && (
          <div className="flex items-center gap-2 text-slate-400 text-xs font-mono p-2">
            <div className="w-3.5 h-3.5 border-2 border-slate-700 border-t-transparent rounded-full animate-spin"></div>
            <span>Checking prior failures in MongoDB Atlas...</span>
          </div>
        )}
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
            placeholder={`Ask DevMemory in ${workspace} (e.g. "How should we resolve token expiration in auth middleware?")...`}
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
