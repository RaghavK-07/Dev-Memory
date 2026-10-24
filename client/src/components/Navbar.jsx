import React from 'react';
import { Database, Cpu, Sparkles, BookOpen, Layers, RefreshCw, Radio } from 'lucide-react';

export default function Navbar({
  activeTab,
  setActiveTab,
  workspace,
  setWorkspace,
  health,
  lastEvent,
  onReseed,
  loading
}) {
  return (
    <header className="border-b border-slate-800 bg-[#070c16]/90 backdrop-blur sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-mongo-green to-emerald-700 flex items-center justify-center shadow-lg shadow-mongo-green/20">
              <Database className="w-5 h-5 text-black font-bold" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg text-white tracking-tight">DevMemory</span>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-mongo-slate text-mongo-green border border-mongo-green/30">
                  MongoDB Atlas
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">The coding agent that learns from mistakes</p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center space-x-1 sm:space-x-2">
            <button
              onClick={() => setActiveTab('agent')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${
                activeTab === 'agent'
                  ? 'bg-slate-800 text-mongo-green border border-mongo-green/30 shadow'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Cpu className="w-4 h-4" />
              <span>Agent Chat</span>
            </button>

            <button
              onClick={() => setActiveTab('hub')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${
                activeTab === 'hub'
                  ? 'bg-slate-800 text-mongo-green border border-mongo-green/30 shadow'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Memory Hub</span>
              {health?.counts?.total !== undefined && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-xs bg-slate-900 text-slate-300">
                  {health.counts.total}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('demo')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${
                activeTab === 'demo'
                  ? 'bg-emerald-950/80 text-mongo-green border border-mongo-green/50 shadow-md shadow-mongo-green/10 font-semibold'
                  : 'text-mongo-green/80 hover:text-mongo-green hover:bg-emerald-950/40'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span className="relative flex items-center">
                Demo Flow
                <span className="w-2 h-2 ml-1.5 rounded-full bg-mongo-green animate-ping"></span>
              </span>
            </button>

            <button
              onClick={() => setActiveTab('arch')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1.5 hidden md:flex ${
                activeTab === 'arch'
                  ? 'bg-slate-800 text-mongo-green border border-mongo-green/30 shadow'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Architecture</span>
            </button>
          </nav>

          {/* Right Controls: Workspace & Atlas Status */}
          <div className="flex items-center gap-3">
            {/* Workspace Select */}
            <div className="hidden lg:flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1">
              <span className="text-xs text-slate-400 font-mono">Workspace:</span>
              <select
                value={workspace}
                onChange={(e) => setWorkspace(e.target.value)}
                className="bg-transparent text-xs font-mono font-medium text-mongo-green focus:outline-none cursor-pointer"
              >
                <option value="auth-service" className="bg-slate-900 text-slate-200">auth-service</option>
                <option value="payment-gateway" className="bg-slate-900 text-slate-200">payment-gateway</option>
                <option value="checkout-api" className="bg-slate-900 text-slate-200">checkout-api</option>
              </select>
            </div>

            {/* Live Change Stream Pill */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs">
              <Radio className={`w-3.5 h-3.5 ${lastEvent ? 'text-mongo-green animate-pulse' : 'text-slate-500'}`} />
              <span className="text-slate-400 hidden xl:inline">Stream:</span>
              <span className="text-slate-300 font-mono">
                {lastEvent ? lastEvent.operationType : 'Live'}
              </span>
            </div>

            {/* Re-seed Button */}
            <button
              onClick={onReseed}
              disabled={loading}
              title="Reset & Re-Seed demo memories"
              className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-mongo-green' : ''}`} />
            </button>
          </div>

        </div>
      </div>
    </header>
  );
}
