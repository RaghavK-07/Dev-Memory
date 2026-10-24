import React, { useState } from 'react';
import { Search, Plus, Filter, Eye, AlertOctagon, Shield, BookCheck, Compass, CheckCircle2, Layers, Trash2, ArrowUpRight, Zap } from 'lucide-react';

export default function MemoryHub({
  memories,
  onInspectMemory,
  onOpenRecordModal,
  onRefresh
}) {
  const [selectedType, setSelectedType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Calculate metrics
  const totalMemories = memories.length;
  const totalRectifications = memories.reduce((acc, m) => acc + (m.recallStats?.recallsCount || 0), 0);

  const filtered = memories.filter(m => {
    if (selectedType !== 'all' && m.type !== selectedType) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = m.content?.title?.toLowerCase().includes(q);
      const matchProblem = m.content?.problem?.toLowerCase().includes(q);
      const matchRec = m.content?.recommendation?.toLowerCase().includes(q);
      const matchTags = (m.lifecycle?.tags || []).some(t => t.toLowerCase().includes(q));
      if (!matchTitle && !matchProblem && !matchRec && !matchTags) return false;
    }
    return true;
  });

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!confirm('Forget this memory? The assistant will no longer automatically rectify it.')) return;
    try {
      await fetch(`/api/memories/${id}?hard=true`, { method: 'DELETE' });
      onRefresh();
    } catch (err) {
      alert('Error deleting: ' + err.message);
    }
  };

  const getTypeStyle = (type) => {
    switch (type) {
      case 'failed_fix':
        return { label: 'Failed Fix', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' };
      case 'constraint':
        return { label: 'Constraint', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' };
      case 'convention':
        return { label: 'Convention', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' };
      case 'architecture':
        return { label: 'Architecture', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' };
      default:
        return { label: type || 'Pattern', bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' };
    }
  };

  return (
    <div className="space-y-5">
      
      {/* Top Stat Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">Long-Term Memories</span>
            <span className="text-xl font-bold text-slate-900 mt-0.5 block">{totalMemories}</span>
          </div>
          <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-700">
            <Layers className="w-4 h-4" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">Auto-Rectifications Triggered</span>
            <span className="text-xl font-bold text-emerald-600 mt-0.5 block">{totalRectifications} times</span>
          </div>
          <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
            <Zap className="w-4 h-4" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">MongoDB Atlas Real-Time</span>
            <span className="text-sm font-bold text-emerald-600 mt-1 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Change Stream Active
            </span>
          </div>
          <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search long-term memories (bugs, rules, keywords)..."
            className="w-full bg-slate-50 border border-slate-200 rounded-md pl-9 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 focus:bg-white transition"
          />
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-900 cursor-pointer"
          >
            <option value="all">Type: All</option>
            <option value="failed_fix">Failed Fixes</option>
            <option value="constraint">Constraints</option>
            <option value="convention">Conventions</option>
            <option value="architecture">Architectures</option>
            <option value="pattern">Patterns</option>
          </select>

          <button
            onClick={onOpenRecordModal}
            className="px-3 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium transition flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Memory</span>
          </button>
        </div>

      </div>

      {/* Memory Gallery */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-xl border border-dashed border-slate-200">
            <Layers className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <h4 className="text-xs font-semibold text-slate-700">No memories matched filter criteria</h4>
            <p className="text-[11px] text-slate-400 mt-0.5">Use "Teach New Invariant" or ask the AI to remember something in chat.</p>
          </div>
        ) : (
          filtered.map((memory) => {
            const badge = getTypeStyle(memory.type);
            const recalls = memory.recallStats?.recallsCount || 0;

            return (
              <div
                key={memory._id}
                onClick={() => onInspectMemory(memory._id)}
                className="p-4 bg-white rounded-xl border border-slate-200 hover:border-slate-300 transition shadow-sm hover:shadow cursor-pointer group"
              >
                {/* Header Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${badge.bg} ${badge.text} ${badge.border}`}>
                      {badge.label}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                      {memory.lifecycle?.status || 'active'}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] font-mono">
                    <span className={recalls > 0 ? 'text-emerald-700 font-medium' : 'text-slate-400'}>
                      Auto-rectified {recalls}x
                    </span>
                    <button
                      onClick={(e) => handleDelete(memory._id, e)}
                      title="Forget this memory"
                      className="p-1 text-slate-400 hover:text-red-600 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Title */}
                <h4 className="text-xs font-semibold text-slate-900 mb-1 group-hover:text-slate-800 transition">
                  {memory.content?.title}
                </h4>

                {/* What happened (Avoided) */}
                {memory.content?.attemptedFix && (
                  <p className="text-[11px] text-rose-700 mb-1 leading-snug">
                    <span className="font-medium text-slate-700">Past failure avoided:</span> {memory.content.attemptedFix}
                    {memory.content?.outcome ? ` — ${memory.content.outcome}` : ''}
                  </p>
                )}

                {/* What is automatically rectified */}
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-[11px] text-slate-800 mt-2">
                  <span className="font-semibold text-slate-900 block mb-0.5">Automatic Rectification:</span>
                  <p className="text-slate-700 line-clamp-2">{memory.content?.recommendation}</p>
                </div>

                {/* Tags and Inspect link */}
                <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-100 text-[10px] text-slate-400">
                  <div className="flex flex-wrap gap-1 font-mono">
                    {(memory.lifecycle?.tags || []).map(t => (
                      <span key={t} className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                        #{t}
                      </span>
                    ))}
                  </div>

                  <span className="text-slate-500 font-mono group-hover:text-slate-900 flex items-center gap-1 transition">
                    Inspect memory details →
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

    </div>
  );
}
