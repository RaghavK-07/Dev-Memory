import React, { useState } from 'react';
import { Search, Plus, Filter, Eye, AlertOctagon, Shield, BookCheck, Compass, CheckCircle2, Layers } from 'lucide-react';

export default function MemoryHub({
  memories,
  workspace,
  setWorkspace,
  onInspectMemory,
  onOpenRecordModal
}) {
  const [selectedType, setSelectedType] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = memories.filter(m => {
    if (workspace !== 'all' && m.workspace !== workspace) return false;
    if (selectedType !== 'all' && m.type !== selectedType) return false;
    if (selectedStatus !== 'all' && m.lifecycle.status !== selectedStatus) return false;
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

  const getTypeStyle = (type) => {
    switch (type) {
      case 'failed_fix':
        return { label: 'Failed Fix', bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' };
      case 'constraint':
        return { label: 'Constraint', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' };
      case 'convention':
        return { label: 'Convention', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' };
      case 'architecture':
        return { label: 'Architecture', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' };
      default:
        return { label: type, bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' };
    }
  };

  return (
    <div className="space-y-4">
      
      {/* Top Filter Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search learned bugs, constraints, and recommendations..."
            className="w-full bg-slate-50 border border-slate-200 rounded-md pl-9 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 focus:bg-white transition"
          />
        </div>

        {/* Dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={workspace}
            onChange={(e) => setWorkspace(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 text-xs font-mono text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-900 cursor-pointer"
          >
            <option value="all">Workspace: All</option>
            <option value="auth-service">auth-service</option>
            <option value="payment-gateway">payment-gateway</option>
            <option value="checkout-api">checkout-api</option>
          </select>

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
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-900 cursor-pointer"
          >
            <option value="all">Status: All</option>
            <option value="active">Active</option>
            <option value="superseded">Superseded</option>
          </select>

          <button
            onClick={onOpenRecordModal}
            className="px-3 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium transition flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Rule</span>
          </button>
        </div>

      </div>

      {/* Memory Cards / List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-xl border border-dashed border-slate-200">
            <Layers className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <h4 className="text-xs font-semibold text-slate-700">No learned rules found</h4>
            <p className="text-[11px] text-slate-400 mt-0.5">Use "Add Rule" or record a bug to populate MongoDB Atlas.</p>
          </div>
        ) : (
          filtered.map((memory) => {
            const badge = getTypeStyle(memory.type);

            return (
              <div
                key={memory._id}
                className={`p-4 bg-white rounded-xl border transition shadow-sm hover:shadow ${
                  memory.lifecycle?.status === 'superseded'
                    ? 'border-slate-200 opacity-60 bg-slate-50/50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${badge.bg} ${badge.text} ${badge.border}`}>
                      {badge.label}
                    </span>
                    <span className="text-[11px] font-mono text-slate-500">
                      {memory.workspace}
                    </span>
                    <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                      memory.lifecycle?.status === 'active'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      {memory.lifecycle?.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono">
                    <span>Recalled {memory.recallStats?.recallsCount || 0}x</span>
                    <button
                      onClick={() => onInspectMemory(memory._id)}
                      className="px-2 py-1 rounded border border-slate-200 text-slate-700 hover:bg-slate-50 transition flex items-center gap-1"
                    >
                      <Eye className="w-3 h-3 text-slate-500" />
                      <span>Inspect</span>
                    </button>
                  </div>
                </div>

                {/* Title */}
                <h4 className="text-xs font-semibold text-slate-900 mb-1">
                  {memory.content?.title}
                </h4>

                {/* Content Summary */}
                {memory.content?.attemptedFix && (
                  <p className="text-[11px] text-red-700 mb-1">
                    <span className="font-medium text-slate-700">Failed approach:</span> {memory.content.attemptedFix}
                  </p>
                )}

                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-[11px] text-slate-800 mt-2">
                  <span className="font-medium text-slate-900 block mb-0.5">Mandated Solution:</span>
                  <p className="line-clamp-2 text-slate-700">{memory.content?.recommendation}</p>
                </div>

                {/* Tags */}
                {memory.lifecycle?.tags && memory.lifecycle.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2.5">
                    {memory.lifecycle.tags.map(t => (
                      <span key={t} className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-slate-100 text-slate-600">
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

    </div>
  );
}
