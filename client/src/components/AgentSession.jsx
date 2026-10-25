import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ArrowUp, Check, Copy, ShieldAlert, Database } from 'lucide-react';

export default function AgentSession({
  onInspectMemory,
  onNavigateToMemory
}) {
  const [inputQuery, setInputQuery] = useState('');
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      sender: 'agent',
      text: `Hello! I am **DevMemory**, your AI assistant powered by **Short-Term** and **MongoDB Long-Term Memory**.

- **Short-Term Memory**: I retain full context across all prompts in our session. Ask follow-up questions, request optimizations, or paste code naturally!
- **Long-Term Memory (MongoDB Atlas)**: Every interaction automatically extracts and commits key takeaways, rules, and decisions to MongoDB. On future chats, I will automatically recall them and prevent past mistakes.`,
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
      // Pass previous conversational turns as short-term working memory
      const history = messages
        .filter(m => !m.isError && m.id !== 'welcome')
        .slice(-10)
        .map(m => ({
          role: m.sender === 'user' ? 'user' : 'model',
          text: m.text
        }));

      const response = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          history,
          sessionId: 'session-live',
          workspace: 'default',
          role: 'developer'
        })
      });

      const rawText = await response.text();
      let data;
      try {
        data = JSON.parse(rawText);
      } catch (e) {
        throw new Error(rawText.slice(0, 140) || `Server error (${response.status})`);
      }

      if (data.success) {
        const agentMsg = {
          id: 'agent-' + Date.now(),
          sender: 'agent',
          text: data.response,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          autoRectification: data.autoRectification,
          newlyLearnedMemory: data.newlyLearnedMemory,
          wasMemoryUpdated: data.wasMemoryUpdated,
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
                    <Database className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-[11px] block text-emerald-800">
                        {msg.wasMemoryUpdated ? 'Updated Long-Term Memory (MongoDB Atlas)' : 'Committed to Long-Term Memory (MongoDB Atlas)'}
                      </span>
                      <span className="text-[11px] text-emerald-950 font-medium">
                        "{msg.newlyLearnedMemory.content.title}"
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => onInspectMemory(msg.newlyLearnedMemory._id)}
                    className="text-[10px] font-mono font-medium text-emerald-700 hover:text-emerald-900 underline whitespace-nowrap"
                  >
                    Inspect Memory →
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
                        Auto-Rectified from Long-Term Memory
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

              {/* Markdown Preview Content */}
              <div className="font-sans text-xs leading-relaxed">
                <ReactMarkdown
                  components={{
                    code({ node, inline, className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || '');
                      const codeString = String(children).replace(/\n$/, '');

                      if (!inline && (match || codeString.includes('\n'))) {
                        const lang = match ? match[1] : '';
                        return (
                          <div className="my-2.5 rounded-lg bg-slate-950 border border-slate-800 overflow-hidden font-mono text-[11px] shadow-sm">
                            <div className="px-3 py-1.5 bg-slate-900 border-b border-slate-800 text-[10px] text-slate-400 flex items-center justify-between font-mono">
                              <span className="uppercase text-slate-300 font-semibold">{lang || 'code'}</span>
                              <button
                                type="button"
                                onClick={() => handleCopyCode(codeString, codeString)}
                                className="flex items-center gap-1 hover:text-white transition text-slate-400"
                              >
                                {copiedIndex === codeString ? (
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
                            <pre className="p-3.5 overflow-x-auto text-emerald-300 leading-relaxed font-mono">
                              <code>{codeString}</code>
                            </pre>
                          </div>
                        );
                      }

                      return (
                        <code
                          className={`px-1.5 py-0.5 rounded font-mono text-[11px] ${
                            msg.sender === 'user'
                              ? 'bg-slate-800 text-slate-100'
                              : 'bg-slate-100 text-slate-800 border border-slate-200/60'
                          }`}
                          {...props}
                        >
                          {children}
                        </code>
                      );
                    },
                    h1: ({ children }) => <h1 className={`text-sm font-bold mt-3 mb-1.5 ${msg.sender === 'user' ? 'text-white' : 'text-slate-900'}`}>{children}</h1>,
                    h2: ({ children }) => <h2 className={`text-xs font-bold mt-2.5 mb-1 ${msg.sender === 'user' ? 'text-white' : 'text-slate-900'}`}>{children}</h2>,
                    h3: ({ children }) => <h3 className={`text-xs font-semibold mt-2 mb-1 ${msg.sender === 'user' ? 'text-white' : 'text-slate-900'}`}>{children}</h3>,
                    p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
                    ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
                    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                    blockquote: ({ children }) => (
                      <blockquote className={`border-l-2 pl-3 my-2 italic ${msg.sender === 'user' ? 'border-slate-500 text-slate-300' : 'border-slate-300 text-slate-600 bg-slate-50/50 py-1 rounded-r'}`}>
                        {children}
                      </blockquote>
                    ),
                    strong: ({ children }) => <strong className={`font-semibold ${msg.sender === 'user' ? 'text-white' : 'text-slate-900'}`}>{children}</strong>,
                    hr: () => <hr className="my-3 border-slate-200" />
                  }}
                >
                  {msg.text}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        ))}

        {isSubmitting && (
          <div className="flex items-center gap-2.5 text-slate-600 text-xs font-mono p-3 bg-slate-50 border border-slate-200/80 rounded-lg">
            <div className="w-3.5 h-3.5 border-2 border-slate-800 border-t-transparent rounded-full animate-spin"></div>
            <span>Reasoning with Gemini & querying persistent memory in MongoDB Atlas...</span>
          </div>
        )}
      </div>

      {/* Input Form with Arrow Send Button */}
      <div className="p-3 bg-white border-t border-slate-200">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-end gap-2"
        >
          <textarea
            rows={2}
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask DevMemory anything, paste code, or state a project rule..."
            disabled={isSubmitting}
            className="flex-1 min-h-[48px] max-h-[160px] resize-y bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 focus:bg-white transition leading-relaxed"
          />
          <button
            type="submit"
            disabled={isSubmitting || !inputQuery.trim()}
            title="Send"
            aria-label="Send message"
            className="h-[48px] w-[48px] rounded-xl bg-slate-900 hover:bg-slate-800 text-white transition flex items-center justify-center disabled:opacity-30 disabled:hover:bg-slate-900 flex-shrink-0 shadow-sm"
          >
            <ArrowUp className="w-5 h-5 stroke-[2.2]" />
          </button>
        </form>
      </div>

    </div>
  );
}