import React from 'react';
import { Terminal, Database, MessageSquare, Settings } from 'lucide-react';

export default function Navbar({
  activeTab,
  setActiveTab,
  memoriesCount,
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
              {typeof memoriesCount === 'number' && (
                <span className="ml-1 px-1.5 py-0.2 rounded text-[10px] bg-emerald-100 text-emerald-800 font-mono font-medium">
                  {memoriesCount}
                </span>
              )}
            </button>
          </nav>

          {/* Right Action: Settings moved to the end */}
          <div className="flex items-center">
            <button
              onClick={onOpenSettings}
              title="AI Model & API Key Settings"
              className="p-2 rounded-md border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>

        </div>
      </div>
    </header>
  );
}
