import React, { useState, useEffect } from 'react';
import { Layers, Search, Filter, Clock, Eye, AlertOctagon, Shield, BookCheck, Compass, CheckCircle2, AlertTriangle, ArrowRight, Sparkles } from 'lucide-react';

export default function MemoryHub({
  memories,
  workspace,
  setWorkspace,
  onInspectMemory,
  onRefresh,
  loading
}) {
  const [selectedType, setSelectedType] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [vectorTestQuery, setVectorTestQuery] = useState('');
  const [vectorResults, setVectorResults] = useState(null);
  const [vectorLoading, setVectorLoading] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Update clock every second for live TTL countdowns
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Filter memories
  const filtered = memories.filter(m => {
    if (workspace !== 'all' && m.workspace !== workspace) return false;
    if (selectedType !== 'all' && m.type !== selectedType) return false;
    if (selectedStatus !== 'all' && m.lifecycle.status !== selectedStatus) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = m.content?.title?.toLowerCase().includes(q);
      const matchProblem = m.content?.problem?.toLowerCase().includes(q);
      const matchTags = (m.lifecycle?.tags || []).some(t => t.toLowerCase().includes(q));
      if (!matchTitle && !matchProblem && !matchTags) return false;
    }
    return true;
  });

  const handleTestVectorSearch = async () => {
    if (!vectorTestQuery.trim()) return;
    setVectorLoading(true);
    try {
      const res = await fetch('/api/memories/vector-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: vectorTestQuery,
          workspace: workspace === 'all' ? 'auth-service' : workspace,
          status: 'all',
          limit: 4,
          minScore: 0.3
        })
      });
      const data = await res.json();
      if (data.success) {
        setVectorResults(data.results);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setVectorLoading(false);
    }
  };

  const getTypeBadge = (type) => {
    switch (type) {
      case 'failed_fix':
        return { label: 'Failed Fix', bg: 'bg-red-950/80', text: 'text-red-400', border: 'border-red-800/50', icon: AlertOctagon };
      case 'constraint':
        return { label: 'Constraint', bg: 'bg-blue-950/80', text: 'text-blue-400', border: 'border-blue-800/50', icon: Shield };
      case 'convention':
        return { label: 'Convention', bg: 'bg-purple-950/80', text: 'text-purple-400', border: 'border-purple-800/50', icon: BookCheck };
      case 'architecture':
        return { label: 'Architecture', bg: 'bg-emerald-950/80', text: 'text-emerald-400', border: 'border-emerald-800/50', icon: Compass };
      default:
        return { label: type, bg: 'bg-slate-800', text: 'text-slate-300', border: 'border-slate-700', icon: Layers };
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top Bar: Search & Filters */}
      <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-5 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          {/* Search bar */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search memories by title, problem, tag or code..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-mongo-green transition"
            />
          </div>

          {/* Type & Status Filters */}
          <div className="flex flex-wrap items-center gap-2">
            
            {/* Workspace Filter */}
            <select
              value={workspace}
              onChange={(e) => setWorkspace(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-300 focus:outline-none focus:border-mongo-green cursor-pointer"
            >
              <option value="all">Workspace: All</option>
              <option value="auth-service">auth-service</option>
              <option value="payment-gateway">payment-gateway</option>
              <option value="checkout-api">checkout-api</option>
            </select>

            {/* Type Filter */}
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-300 focus:outline-none focus:border-mongo-green cursor-pointer"
            >
              <option value="all">Type: All</option>
              <option value="failed_fix">Failed Fix</option>
              <option value="constraint">Constraint</option>
              <option value="convention">Convention</option>
              <option value="architecture">Architecture</option>
              <option value="decision">Decision</option>
            </select>

            {/* Status Filter */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-300 focus:outline-none focus:border-mongo-green cursor-pointer"
            >
              <option value="all">Status: All</option>
              <option value="active">Active</option>
              <option value="superseded">Superseded</option>
              <option value="invalidated">Invalidated</option>
            </select>

          </div>

        </div>
      </div>

      {/* Vector Search Tester Drawer */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
            <Sparkles className="w-3.5 h-3.5 text-mongo-green" />
            <span>MongoDB Vector Search Tester</span>
          </div>
          <span className="text-[11px] font-mono text-slate-500">
            Cosine Similarity & Metadata Filter
          </span>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={vectorTestQuery}
            onChange={(e) => setVectorTestQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleTestVectorSearch()}
            placeholder="Type query to test vector recall (e.g. 'token expiry', 'float currency')..."
            className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-mongo-green"
          />
          <button
            onClick={handleTestVectorSearch}
            disabled={vectorLoading || !vectorTestQuery.trim()}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-mongo-green font-medium text-xs transition border border-mongo-green/30 disabled:opacity-50"
          >
            {vectorLoading ? 'Searching...' : 'Vector Recall'}
          </button>
        </div>

        {vectorResults && (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 pt-2 border-t border-slate-800/80">
            {vectorResults.length === 0 ? (
              <p className="text-xs text-slate-400 py-1">No vector matches found for this query.</p>
            ) : (
              vectorResults.map(r => (
                <div
                  key={r._id}
                  onClick={() => onInspectMemory(r._id)}
                  className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-mongo-green/40 cursor-pointer text-xs transition"
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="font-semibold text-slate-200 truncate">{r.content.title}</span>
                    <span className="px-1.5 py-0.5 rounded font-mono text-[10px] bg-emerald-950 text-mongo-green border border-mongo-green/30">
                      {(r.relevanceScore * 100).toFixed(1)}%
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 truncate">{r.content.problem || r.content.recommendation}</p>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Memories Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.length === 0 ? (
          <div className="col-span-full py-16 text-center bg-slate-900/30 rounded-2xl border border-dashed border-slate-800">
            <Layers className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <h4 className="text-sm font-semibold text-slate-300">No memories matched filter criteria</h4>
            <p className="text-xs text-slate-500 mt-1">Try resetting filters or click "Simulate Mistake" in the Agent console.</p>
          </div>
        ) : (
          filtered.map(memory => {
            const badge = getTypeBadge(memory.type);
            const BadgeIcon = badge.icon;
            
            // Calculate TTL countdown if expiresAt is set
            let ttlRemaining = null;
            if (memory.lifecycle?.expiresAt) {
              const diffMs = new Date(memory.lifecycle.expiresAt).getTime() - now;
              if (diffMs > 0) {
                const totalSec = Math.floor(diffMs / 1000);
                const min = Math.floor(totalSec / 60);
                const sec = totalSec % 60;
                ttlRemaining = `${min}:${sec < 10 ? '0' : ''}${sec}`;
              } else {
                ttlRemaining = 'Expired (Pending TTL reap)';
              }
            }

            return (
              <div
                key={memory._id}
                className={`flex flex-col justify-between p-5 rounded-2xl bg-slate-900/70 border transition shadow-lg hover:shadow-xl ${
                  memory.lifecycle?.status === 'superseded'
                    ? 'border-amber-700/40 opacity-75'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  {/* Card Header: Type Badge, Status, TTL */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold border flex items-center gap-1.5 ${badge.bg} ${badge.text} ${badge.border}`}>
                        <BadgeIcon className="w-3.5 h-3.5" />
                        <span>{badge.label}</span>
                      </span>

                      {/* Status */}
                      <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-medium ${
                        memory.lifecycle?.status === 'active'
                          ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                          : memory.lifecycle?.status === 'superseded'
                          ? 'bg-amber-950/60 text-amber-400 border border-amber-800/40'
                          : 'bg-slate-800 text-slate-400'
                      }`}>
                        {memory.lifecycle?.status}
                      </span>
                    </div>

                    {/* TTL Countdown Badge if ephemeral */}
                    {ttlRemaining && (
                      <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-red-950/80 text-red-300 border border-red-800/50 flex items-center gap-1 animate-pulse">
                        <Clock className="w-3 h-3" />
                        <span>TTL: {ttlRemaining}</span>
                      </span>
                    )}
                  </div>

                  {/* Title */}
                  <h3 className="font-semibold text-sm text-white mb-2 leading-snug">
                    {memory.content.title}
                  </h3>

                  {/* Problem & Outcome */}
                  <p className="text-xs text-slate-400 mb-3 line-clamp-2">
                    {memory.content.problem}
                  </p>

                  {/* Recommendation / Invariant */}
                  <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 mb-3 text-xs text-slate-300">
                    <strong className="text-mongo-green font-mono block text-[11px] mb-1">
                      {memory.type === 'failed_fix' ? '✓ Verified Safe Replacement:' : '✓ Mandated Architecture:'}
                    </strong>
                    <p className="line-clamp-2 text-slate-300">
                      {memory.content.recommendation}
                    </p>
                  </div>

                  {/* Tags */}
                  {memory.lifecycle?.tags && memory.lifecycle.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {memory.lifecycle.tags.map(t => (
                        <span key={t} className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-950 text-slate-400 border border-slate-800">
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Card Footer: Metadata & Inspect Button */}
                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500 font-mono">
                  <div className="flex items-center gap-3">
                    <span>{memory.workspace}</span>
                    <span>•</span>
                    <span>Recalled {memory.recallStats?.recallsCount || 0}x</span>
                  </div>

                  <button
                    onClick={() => onInspectMemory(memory._id)}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition flex items-center gap-1.5"
                  >
                    <Eye className="w-3.5 h-3.5 text-mongo-green" />
                    <span>Inspect</span>
                  </button>
                </div>

              </div>
            );
          })
        )}
      </div>

    </div>
  );
}
