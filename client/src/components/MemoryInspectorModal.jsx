import React, { useState, useEffect } from 'react';
import { X, Copy, Check, Trash2, ArrowUpRight, Database, Clock, History, AlertCircle } from 'lucide-react';

export default function MemoryInspectorModal({ memoryId, onClose, onRefresh }) {
  const [memory, setMemory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [activeView, setActiveView] = useState('overview'); // overview | raw
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!memoryId) return;
    const fetchMemory = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/memories/${memoryId}`);
        const data = await res.json();
        if (data.success) {
          setMemory(data.memory);
        } else {
          setError(data.error);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchMemory();
  }, [memoryId]);

  const handleCopyJson = () => {
    if (!memory) return;
    navigator.clipboard.writeText(JSON.stringify(memory, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDelete = async (hard = false) => {
    if (!confirm(hard ? 'Permanently delete this MongoDB document?' : 'Soft delete (mark as invalidated)?')) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/memories/${memoryId}?hard=${hard}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        onRefresh();
        onClose();
      }
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  if (!memoryId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-xl overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-slate-900">Memory Inspector</span>
              {memory && (
                <span className="text-[11px] font-mono text-slate-500">
                  ID: {memory._id}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">MongoDB Atlas Vector & Lifecycle Document</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyJson}
              className="px-2.5 py-1 rounded-md border border-slate-200 hover:bg-slate-100 text-xs text-slate-600 transition flex items-center gap-1.5"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy JSON'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab switch */}
        <div className="px-6 pt-2 border-b border-slate-200 bg-white flex items-center gap-4 text-xs font-medium">
          <button
            onClick={() => setActiveView('overview')}
            className={`py-2 border-b-2 transition ${
              activeView === 'overview'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveView('raw')}
            className={`py-2 border-b-2 transition ${
              activeView === 'raw'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Raw BSON Document
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4 text-xs">
          {loading ? (
            <div className="py-16 text-center text-slate-400 font-mono">
              Fetching document from Atlas...
            </div>
          ) : error ? (
            <div className="p-3 rounded bg-red-50 text-red-700 border border-red-200">
              {error}
            </div>
          ) : memory ? (
            activeView === 'overview' ? (
              <>
                {/* Meta details */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-[10px] text-slate-400 font-medium block">Type</span>
                    <span className="text-xs font-semibold text-slate-800 uppercase font-mono">{memory.type}</span>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-[10px] text-slate-400 font-medium block">Storage</span>
                    <span className="text-xs font-semibold text-emerald-700 font-mono">MongoDB Atlas</span>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-[10px] text-slate-400 font-medium block">Status</span>
                    <span className="text-xs font-semibold text-emerald-700 font-mono">{memory.lifecycle?.status}</span>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-[10px] text-slate-400 font-medium block">Total Recalls</span>
                    <span className="text-xs font-semibold text-slate-800 font-mono">{memory.recallStats?.recallsCount || 0}</span>
                  </div>
                </div>

                {/* Title & Problem */}
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                  <h4 className="font-semibold text-slate-900 text-xs">{memory.content?.title}</h4>
                  <p className="text-slate-600 leading-relaxed">{memory.content?.problem}</p>
                  {memory.content?.attemptedFix && (
                    <div className="pt-1 text-red-700">
                      <strong>Failed approach:</strong> {memory.content.attemptedFix}
                    </div>
                  )}
                  {memory.content?.outcome && (
                    <div className="text-slate-700">
                      <strong>Failure reason:</strong> {memory.content.outcome}
                    </div>
                  )}
                </div>

                {/* Recommendation */}
                <div className="p-4 rounded-lg bg-slate-900 text-slate-100 space-y-1.5">
                  <span className="text-[11px] font-mono text-emerald-400 font-semibold block uppercase">
                    Mandated Pattern / Invariant
                  </span>
                  <p className="text-slate-300 leading-relaxed text-xs">{memory.content?.recommendation}</p>
                  {memory.content?.codeSnippet && (
                    <pre className="mt-2 p-2.5 rounded bg-black/40 text-emerald-300 font-mono text-[11px] overflow-x-auto">
                      {memory.content.codeSnippet}
                    </pre>
                  )}
                </div>

                {/* Recall Telemetry */}
                <div className="border border-slate-200 rounded-lg p-3 space-y-2">
                  <span className="font-semibold text-slate-700 block text-[11px]">Recall History</span>
                  {(!memory.recallStats?.recentRecalls || memory.recallStats.recentRecalls.length === 0) ? (
                    <p className="text-slate-400 italic">No recalls recorded yet.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {memory.recallStats.recentRecalls.map((r, i) => (
                        <div key={i} className="p-2 rounded bg-slate-50 border border-slate-200 flex items-center justify-between text-[11px]">
                          <div>
                            <span className="text-slate-800">"{r.query}"</span>
                            <span className="text-slate-400 font-mono ml-2">
                              {new Date(r.recalledAt).toLocaleTimeString()}
                            </span>
                          </div>
                          <span className="font-mono text-slate-600">
                            {(r.relevanceScore * 100).toFixed(1)}% match
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <pre className="p-3.5 rounded-lg bg-slate-900 text-emerald-300 font-mono text-[11px] overflow-x-auto leading-relaxed max-h-96">
                {JSON.stringify(memory, null, 2)}
              </pre>
            )
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <button
            onClick={() => handleDelete(true)}
            disabled={actionLoading}
            className="text-xs text-red-600 hover:text-red-800 transition flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Document</span>
          </button>

          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium transition"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
