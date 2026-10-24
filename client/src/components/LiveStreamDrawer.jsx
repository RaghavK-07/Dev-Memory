import React, { useState } from 'react';
import { Radio, ChevronUp, ChevronDown, CheckCircle, Clock } from 'lucide-react';

export default function LiveStreamDrawer({ streamEvents }) {
  const [expanded, setExpanded] = useState(false);

  if (!streamEvents || streamEvents.length === 0) {
    return null;
  }

  const latest = streamEvents[0];

  return (
    <div className="fixed bottom-4 right-4 z-30 max-w-md w-full px-4">
      <div className="bg-[#090f1d]/95 backdrop-blur-md border border-slate-800 rounded-2xl shadow-2xl overflow-hidden transition-all duration-200">
        
        {/* Header Bar */}
        <div
          onClick={() => setExpanded(!expanded)}
          className="px-4 py-2.5 bg-slate-950 flex items-center justify-between cursor-pointer hover:bg-slate-900 transition"
        >
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-mongo-green animate-pulse" />
            <span className="text-xs font-semibold text-white">MongoDB Change Stream</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-emerald-950 text-mongo-green border border-mongo-green/30">
              {streamEvents.length} events
            </span>
          </div>

          <div className="flex items-center gap-2 text-slate-400">
            <span className="text-[11px] font-mono hidden sm:inline">
              Latest: <strong className="text-slate-200">{latest.operationType}</strong>
            </span>
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </div>
        </div>

        {/* Collapsible Content */}
        {expanded && (
          <div className="max-h-60 overflow-y-auto p-3 space-y-2 divide-y divide-slate-800/60">
            {streamEvents.map((evt, idx) => (
              <div key={idx} className="pt-2 first:pt-0 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase font-bold ${
                    evt.operationType === 'insert'
                      ? 'bg-emerald-950 text-mongo-green border border-mongo-green/30'
                      : evt.operationType === 'update'
                      ? 'bg-blue-950 text-blue-300 border border-blue-800/40'
                      : 'bg-red-950 text-red-300'
                  }`}>
                    {evt.operationType}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">
                    {new Date(evt.wallTime || Date.now()).toLocaleTimeString()}
                  </span>
                </div>
                <div className="text-[11px] font-mono text-slate-300 mt-1 truncate">
                  Doc ID: {evt.documentId}
                </div>
                {evt.fullDocument?.content?.title && (
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">
                    {evt.fullDocument.content.title}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
