import React from 'react';
import { Terminal, Database, Plus, Search, Layers, MessageSquare, CheckCircle2, Settings } from 'lucide-react';

export default function Navbar({
  activeTab,
  setActiveTab,
  health,
  onOpenRecordModal,
  onOpenSettings
}) {
  return (
    <header className="border-b border-slate-200 bg-white sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-white shadow-sm">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <span className="font-semibold text-sm text-slate-900 tracking-tight">DevMemory</span>
              <span className="ml-2 text-[11px] font-mono text-slate-500 hidden sm:inline">
                • Short-Term & Long-Term Memory
              </span>
            </div>
          </div>

          {/* Just 2 Clean Navigation Tabs */}
          <nav className="flex items-center space-x-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              onClick={() => setActiveTab('assistant')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition flex items-center gap-1.5 ${
                activeTab === 'assistant'
                  ? 'bg-white text-slate-900 font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 text-slate-700" />
              <span>Chatbot</span>
            </button>

            <button
              onClick={() => setActiveTab('repository')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition flex items-center gap-1.5 ${
                activeTab === 'repository'
                  ? 'bg-white text-slate-900 font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Database className="w-3.5 h-3.5 text-emerald-600" />
              <span>Memory (MongoDB)</span>
              {health?.counts?.active !== undefined && (
                <span className="ml-1 px-1.5 py-0.2 rounded text-[10px] bg-emerald-100 text-emerald-800 font-mono font-medium">
                  {health.counts.active}
                </span>
              )}
            </button>
          </nav>

          {/* Right Action: Record Memory + Settings */}
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenRecordModal}
              className="px-3 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium transition flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Add Memory</span>
            </button>

            <button
              onClick={onOpenSettings}
              title="AI Model & API Key Settings"
              className="p-1.5 rounded-md border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>

            {/* MongoDB Atlas Status */}
            <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-50 border border-slate-200 text-[11px] font-mono text-slate-600">
              {health?.status === 'connected' ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span>Atlas Connected</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  <span title="Add current IP (157.51.39.48) or 0.0.0.0/0 to Atlas Network Access">
                    Atlas: Whitelist IP (157.51.39.48)
                  </span>
                </>
              )}
            </div>
          </div>

        </div>
      </div>
    </header>
  );
}
