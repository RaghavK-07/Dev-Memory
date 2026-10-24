import React, { useState, useEffect } from 'react';
import { X, Database, ShieldCheck, Clock, History, AlertTriangle, Trash2, ArrowUpRight, Copy, Check } from 'lucide-react';

export default function MemoryInspectorModal({ memoryId, onClose, onRefresh }) {
  const [memory, setMemory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [supersedeModalOpen, setSupersedeModalOpen] = useState(false);
  const [newConstraintText, setNewConstraintText] = useState('');
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

  const handleSupersede = async () => {
    if (!newConstraintText.trim()) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/memories/${memoryId}/supersede`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: 'Manual developer architecture update',
          newMemoryData: {
            owner: 'lead-architect',
            workspace: memory.workspace,
            type: 'constraint',
            content: {
              title: 'Updated Constraint: ' + newConstraintText.slice(0, 40) + '...',
              problem: 'Superseded previous pattern: ' + memory.content.title,
              recommendation: newConstraintText,
              codeSnippet: `// Updated architecture rule\n// Compliance verified`
            },
            lifecycle: {
              status: 'active',
              tags: [...(memory.lifecycle?.tags || []), 'superseding-update']
            }
          }
        })
      });
      const data = await res.json();
      if (data.success) {
        setSupersedeModalOpen(false);
        onRefresh();
        onClose();
      }
    } catch (err) {
      alert('Error superseding: ' + err.message);
    } finally {
      setActionLoading(false);
    }
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
      alert('Error deleting: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  if (!memoryId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#090f1d] border border-slate-800 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-mongo-slate flex items-center justify-center border border-mongo-green/40">
              <Database className="w-4 h-4 text-mongo-green" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-white">MongoDB Memory Document Inspector</span>
                {memory && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-800 text-mongo-green border border-mongo-green/20">
                    ID: {memory._id}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">Persistent Vector & Lifecycle Schema</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyJson}
              className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-mono text-slate-300 transition flex items-center gap-1.5"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-mongo-green" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy JSON'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 p-6 overflow-y-auto space-y-6">
          {loading ? (
            <div className="py-20 text-center text-xs font-mono text-slate-400">
              <div className="w-6 h-6 border-2 border-mongo-green border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
              <span>Fetching document from MongoDB Atlas...</span>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-red-950/60 border border-red-800 text-red-200 text-sm">
              {error}
            </div>
          ) : memory ? (
            <>
              {/* Top Overview Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800">
                  <span className="text-[11px] font-mono text-slate-400 block mb-1">Type</span>
                  <span className="text-sm font-semibold text-white uppercase">{memory.type}</span>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800">
                  <span className="text-[11px] font-mono text-slate-400 block mb-1">Status</span>
                  <span className={`text-sm font-semibold font-mono ${
                    memory.lifecycle?.status === 'active' ? 'text-mongo-green' : 'text-amber-400'
                  }`}>
                    {memory.lifecycle?.status}
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800">
                  <span className="text-[11px] font-mono text-slate-400 block mb-1">Total Recalls</span>
                  <span className="text-sm font-semibold text-white">{memory.recallStats?.recallsCount || 0} times</span>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800">
                  <span className="text-[11px] font-mono text-slate-400 block mb-1">TTL Expiry</span>
                  <span className="text-xs font-mono text-slate-300">
                    {memory.lifecycle?.expiresAt ? new Date(memory.lifecycle.expiresAt).toLocaleTimeString() : 'None (Permanent)'}
                  </span>
                </div>
              </div>

              {/* Title & Core Problem */}
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
                <h4 className="font-semibold text-white text-sm">{memory.content?.title}</h4>
                <p className="text-xs text-slate-300 leading-relaxed">{memory.content?.problem}</p>
                {memory.content?.attemptedFix && (
                  <div className="pt-2 text-xs text-red-300">
                    <strong>Attempted Fix:</strong> {memory.content.attemptedFix}
                  </div>
                )}
                {memory.content?.outcome && (
                  <div className="text-xs text-amber-300">
                    <strong>Failure Outcome:</strong> {memory.content.outcome}
                  </div>
                )}
              </div>

              {/* Recall History Timeline (Challenge requirement: Explain why it was selected) */}
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800">
                <div className="flex items-center gap-2 mb-3">
                  <History className="w-4 h-4 text-mongo-green" />
                  <h5 className="text-xs font-semibold text-white uppercase tracking-wider">Semantic Recall Log</h5>
                </div>
                {(!memory.recallStats?.recentRecalls || memory.recallStats.recentRecalls.length === 0) ? (
                  <p className="text-xs text-slate-500 italic">No recalls recorded yet. Ask a question in the Agent tab to trigger vector recall.</p>
                ) : (
                  <div className="space-y-2">
                    {memory.recallStats.recentRecalls.map((r, i) => (
                      <div key={i} className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-medium text-slate-200">Query: "{r.query}"</div>
                          <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                            Session: {r.sessionId} • {new Date(r.recalledAt).toLocaleTimeString()}
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded font-mono text-xs bg-emerald-950 text-mongo-green border border-mongo-green/30">
                          Match: {(r.relevanceScore * 100).toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Raw JSON Document Viewer */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider font-mono">
                    Raw Document (MongoDB BSON/JSON)
                  </span>
                  <span className="text-[11px] font-mono text-slate-500">
                    Embedding: 384 dimensions [{memory.embedding ? memory.embedding.length : 0}]
                  </span>
                </div>
                <pre className="p-4 rounded-2xl bg-slate-950 border border-slate-800 overflow-x-auto text-[11px] font-mono text-emerald-300 leading-relaxed max-h-64">
                  {JSON.stringify(memory, null, 2)}
                </pre>
              </div>
            </>
          ) : null}
        </div>

        {/* Modal Footer Actions */}
        <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleDelete(false)}
              disabled={actionLoading}
              className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-400 hover:text-red-400 transition"
            >
              Invalidate (Soft)
            </button>
            <button
              onClick={() => handleDelete(true)}
              disabled={actionLoading}
              className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-red-950/80 border border-slate-800 hover:border-red-800 text-xs text-slate-400 hover:text-red-400 transition"
            >
              <Trash2 className="w-3.5 h-3.5 inline mr-1" />
              Hard Delete
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSupersedeModalOpen(true)}
              disabled={actionLoading || memory?.lifecycle?.status === 'superseded'}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs transition disabled:opacity-50"
            >
              {memory?.lifecycle?.status === 'superseded' ? 'Already Superseded' : 'Supersede / Correct Memory'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs transition"
            >
              Close
            </button>
          </div>
        </div>

        {/* Supersede Sub-Modal */}
        {supersedeModalOpen && (
          <div className="absolute inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-6 z-20">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-lg w-full space-y-4">
              <h4 className="text-sm font-semibold text-white">Supersede Memory with New Constraint</h4>
              <p className="text-xs text-slate-400">
                This marks Memory <strong>#{memory._id}</strong> as <code className="text-amber-400">superseded</code>, stores a reference to the new document ID, and introduces the updated constraint into MongoDB Vector Search.
              </p>
              <textarea
                value={newConstraintText}
                onChange={(e) => setNewConstraintText(e.target.value)}
                placeholder="e.g. Migrated to Redis Distributed Session Store; stateless JWT refresh tokens deprecated..."
                rows={4}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-mongo-green"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setSupersedeModalOpen(false)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 text-xs text-slate-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSupersede}
                  disabled={actionLoading || !newConstraintText.trim()}
                  className="px-4 py-1.5 rounded-xl bg-mongo-green hover:bg-emerald-400 text-black font-semibold text-xs disabled:opacity-50"
                >
                  Confirm Supersede
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
