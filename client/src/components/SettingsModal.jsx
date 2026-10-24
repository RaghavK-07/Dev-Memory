import React, { useState, useEffect } from 'react';
import { X, Key, Check, Sparkles, ExternalLink } from 'lucide-react';

export default function SettingsModal({ isOpen, onClose }) {
  const [geminiKey, setGeminiKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [status, setStatus] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/system/settings')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setStatus(data);
        }
      })
      .catch(console.error);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);

    try {
      const res = await fetch('/api/system/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          geminiApiKey: geminiKey,
          openaiApiKey: openaiKey
        })
      });
      const data = await res.json();
      if (data.success) {
        setMessage('API keys saved successfully! DevMemory will now use live models.');
        setStatus({ hasGemini: data.hasGemini, hasOpenAI: data.hasOpenAI });
        setTimeout(() => onClose(), 1500);
      }
    } catch (err) {
      setMessage('Error saving keys: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md shadow-xl overflow-hidden">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-slate-700" />
            <h3 className="text-sm font-semibold text-slate-900">AI Model Settings</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSave} className="p-5 space-y-4 text-xs">
          {message && (
            <div className="p-2.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-medium flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span>{message}</span>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-medium text-slate-700">Google Gemini API Key (Recommended, Free)</label>
              {status?.hasGemini && (
                <span className="text-[10px] text-emerald-600 font-medium">Configured</span>
              )}
            </div>
            <input
              type="password"
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              placeholder={status?.hasGemini ? "••••••••••••••••" : "Paste your Gemini API key..."}
              className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-1.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 focus:bg-white"
            />
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noreferrer"
              className="text-[10px] text-blue-600 hover:underline mt-1 inline-flex items-center gap-1"
            >
              Get a free Gemini API key from Google AI Studio <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-medium text-slate-700">OpenAI API Key (Optional)</label>
              {status?.hasOpenAI && (
                <span className="text-[10px] text-emerald-600 font-medium">Configured</span>
              )}
            </div>
            <input
              type="password"
              value={openaiKey}
              onChange={(e) => setOpenaiKey(e.target.value)}
              placeholder={status?.hasOpenAI ? "••••••••••••••••" : "sk-..."}
              className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-1.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 focus:bg-white"
            />
          </div>

          <p className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded border border-slate-100 leading-relaxed">
            If no API key is provided, DevMemory uses its built-in code intelligence engine with MongoDB vector recall.
          </p>

          <div className="pt-2 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 transition font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-white font-medium transition disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Keys'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
