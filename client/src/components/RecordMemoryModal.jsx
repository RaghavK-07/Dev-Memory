import React, { useState } from 'react';
import { X, CheckCircle2, AlertCircle, Database } from 'lucide-react';

export default function RecordMemoryModal({ isOpen, onClose, currentWorkspace, onCreated }) {
  const [workspace, setWorkspace] = useState(currentWorkspace || 'auth-service');
  const [type, setType] = useState('failed_fix');
  const [title, setTitle] = useState('');
  const [problem, setProblem] = useState('');
  const [attemptedFix, setAttemptedFix] = useState('');
  const [outcome, setOutcome] = useState('');
  const [recommendation, setRecommendation] = useState('');
  const [codeSnippet, setCodeSnippet] = useState('');
  const [tags, setTags] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !recommendation.trim()) {
      setError('Title and Recommended Solution are required.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const payload = {
        owner: 'developer',
        workspace,
        type,
        content: {
          title: title.trim(),
          problem: problem.trim(),
          attemptedFix: attemptedFix.trim(),
          outcome: outcome.trim(),
          recommendation: recommendation.trim(),
          codeSnippet: codeSnippet.trim()
        },
        source: {
          sessionId: 'session-manual-record',
          channel: 'manual_entry',
          author: 'Developer'
        },
        lifecycle: {
          status: 'active',
          confidence: 1.0,
          tags: tags.split(',').map(t => t.trim()).filter(Boolean)
        }
      };

      const res = await fetch('/api/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success) {
        onCreated(data.memory);
        onClose();
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-xl overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Record Learned Bug or Invariant</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Persists into MongoDB Atlas vector index so DevMemory will never repeat this mistake.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 p-6 overflow-y-auto space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded-md bg-red-50 border border-red-200 text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Workspace</label>
              <select
                value={workspace}
                onChange={(e) => setWorkspace(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-md px-3 py-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-900 font-mono text-xs"
              >
                <option value="auth-service">auth-service</option>
                <option value="payment-gateway">payment-gateway</option>
                <option value="checkout-api">checkout-api</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">Memory Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-md px-3 py-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-900 text-xs"
              >
                <option value="failed_fix">Failed Fix (Anti-pattern to avoid)</option>
                <option value="constraint">Constraint (Mandatory requirement)</option>
                <option value="convention">Convention (Style or standard)</option>
                <option value="architecture">Architecture (System invariant)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Client-side JWT re-signing causes replay attacks"
              className="w-full bg-white border border-slate-200 rounded-md px-3 py-1.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 text-xs"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">Problem Description</label>
            <textarea
              value={problem}
              onChange={(e) => setProblem(e.target.value)}
              placeholder="What bug or requirement occurred?"
              rows={2}
              className="w-full bg-white border border-slate-200 rounded-md p-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 text-xs"
            />
          </div>

          {type === 'failed_fix' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Attempted Approach (Failed)</label>
                <textarea
                  value={attemptedFix}
                  onChange={(e) => setAttemptedFix(e.target.value)}
                  placeholder="What approach was tried that failed?"
                  rows={2}
                  className="w-full bg-white border border-slate-200 rounded-md p-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 text-xs"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Failure Outcome / Error</label>
                <textarea
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value)}
                  placeholder="What error or test failure happened?"
                  rows={2}
                  className="w-full bg-white border border-slate-200 rounded-md p-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 text-xs"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block font-medium text-slate-700 mb-1">Verified / Recommended Solution</label>
            <textarea
              value={recommendation}
              onChange={(e) => setRecommendation(e.target.value)}
              placeholder="What must be done instead? This rule will be strictly enforced."
              rows={3}
              className="w-full bg-white border border-slate-200 rounded-md p-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 text-xs"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">Code Snippet (Optional)</label>
            <textarea
              value={codeSnippet}
              onChange={(e) => setCodeSnippet(e.target.value)}
              placeholder="// Clean code pattern to mandate..."
              rows={3}
              className="w-full bg-slate-900 text-emerald-300 font-mono text-[11px] rounded-md p-2.5 focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">Tags (Comma separated)</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="auth, jwt, security, redis"
              className="w-full bg-white border border-slate-200 rounded-md px-3 py-1.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 text-xs"
            />
          </div>

          {/* Footer */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 transition text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs transition disabled:opacity-50"
            >
              {isSubmitting ? 'Saving to Atlas...' : 'Save Invariant to MongoDB'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
