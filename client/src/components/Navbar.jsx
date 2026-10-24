import React from 'react';
import { Terminal, Database, Plus, Search, Layers, MessageSquare, CheckCircle2 } from 'lucide-react';

export default function Navbar({
  activeTab,
  setActiveTab,
  workspace,
  setWorkspace,
  health,
  onOpenRecordModal
}) {
  return (
    <header className="border-b border-slate-200 bg-white sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo & Workspace */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-white">
                <Terminal className="w-4 h-4" />
              </div>
              <div>
                <span className="font-semibold text-sm text-slate-900 tracking-tight">DevMemory</span>
                <span className="ml-2 text-[11px] font-mono text-slate-500 hidden sm:inline">
                  Persistent Agent Memory
                </span>
              </div>
            </div>

            {/* Workspace Selector */}
            <div className="hidden md:flex items-center gap-1.5 pl-4 border-l border-slate-200">
              <span className="text-xs font-medium text-slate-500">Workspace:</span>
              <select
                value={workspace}
                onChange={(e) => setWorkspace(e.target.value)}
                className="bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md px-2.5 py-1 text-xs font-mono font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-900 cursor-pointer transition"
              >
                <option value="auth-service">auth-service</option>
                <option value="payment-gateway">payment-gateway</option>
                <option value="checkout-api">checkout-api</option>
              </select>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center space-x-1">
            <button
              onClick={() => setActiveTab('assistant')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition flex items-center gap-1.5 ${
                activeTab === 'assistant'
                  ? 'bg-slate-100 text-slate-900 font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Assistant</span>
            </button>

            <button
              onClick={() => setActiveTab('repository')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition flex items-center gap-1.5 ${
                activeTab === 'repository'
                  ? 'bg-slate-100 text-slate-900 font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Learned Rules</span>
              {health?.counts?.active !== undefined && (
                <span className="ml-1 px-1.5 py-0.2 rounded text-[10px] bg-slate-200 text-slate-700 font-mono">
                  {health.counts.active}
                </span>
              )}
            </button>
          </nav>

          {/* Right Action: Record Rule + Connection Pill */}
          <div className="flex items-center gap-3">
            <button
              onClick={onOpenRecordModal}
              className="px-3 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium transition flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Record Bug / Rule</span>
            </button>

            {/* MongoDB Atlas Status */}
            <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-50 border border-slate-200 text-[11px] font-mono text-slate-600">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>Atlas Connected</span>
            </div>
          </div>

        </div>
      </div>
    </header>
  );
}
