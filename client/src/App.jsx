import React, { useState, useEffect, useCallback } from 'react';
import Navbar from './components/Navbar';
import AgentSession from './components/AgentSession';
import MemoryHub from './components/MemoryHub';
import DemoWalkthrough from './components/DemoWalkthrough';
import ArchitectureDocs from './components/ArchitectureDocs';
import MemoryInspectorModal from './components/MemoryInspectorModal';
import LiveStreamDrawer from './components/LiveStreamDrawer';

export default function App() {
  const [activeTab, setActiveTab] = useState('demo'); // Default to demo so judges see challenge flow first!
  const [workspace, setWorkspace] = useState('auth-service');
  const [memories, setMemories] = useState([]);
  const [health, setHealth] = useState(null);
  const [inspectingMemoryId, setInspectingMemoryId] = useState(null);
  const [streamEvents, setStreamEvents] = useState([]);
  const [loading, setLoading] = useState(false);

  // Fetch memories
  const fetchMemories = useCallback(async () => {
    try {
      const res = await fetch(`/api/memories?workspace=all`);
      const data = await res.json();
      if (data.success) {
        setMemories(data.memories);
      }
    } catch (err) {
      console.error('Failed to fetch memories:', err);
    }
  }, []);

  // Fetch system health
  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/system/health');
      const data = await res.json();
      if (data.success) {
        setHealth(data.health);
      }
    } catch (err) {
      console.error('Failed to fetch health:', err);
    }
  }, []);

  // Initialize and connect SSE
  useEffect(() => {
    fetchMemories();
    fetchHealth();

    // Setup Server-Sent Events for real-time MongoDB Change Streams
    const eventSource = new EventSource('/api/stream');

    eventSource.addEventListener('memory_change', (e) => {
      try {
        const change = JSON.parse(e.data);
        console.log('[SSE] Change Stream event received:', change);
        setStreamEvents(prev => [change, ...prev.slice(0, 19)]);
        // Automatically re-fetch memories and health on any change
        fetchMemories();
        fetchHealth();
      } catch (err) {
        console.error('Error parsing change stream event:', err);
      }
    });

    eventSource.onerror = (err) => {
      console.warn('[SSE] EventSource connection state change:', err);
    };

    return () => {
      eventSource.close();
    };
  }, [fetchMemories, fetchHealth]);

  // Re-seed database
  const handleReseed = async () => {
    if (!confirm('Re-seed MongoDB Atlas with default demo memories?')) return;
    setLoading(true);
    try {
      const res = await fetch('/api/system/seed', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        await fetchMemories();
        await fetchHealth();
      }
    } catch (err) {
      alert('Error reseeding: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Quick Action Triggers
  const handleTriggerMistake = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/agent/simulate-mistake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace, sessionId: 'session-quick-mistake' })
      });
      const data = await res.json();
      if (data.success) {
        await fetchMemories();
        await fetchHealth();
        setInspectingMemoryId(data.memory?._id);
      }
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerCorrection = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/agent/simulate-correction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newConstraint: 'Migrated to Redis Distributed Session Store. Stateless JWT refresh tokens are deprecated; use Redis sliding session TTL.'
        })
      });
      const data = await res.json();
      if (data.success) {
        await fetchMemories();
        await fetchHealth();
        setInspectingMemoryId(data.newMemoryId);
      }
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerEphemeral = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/agent/simulate-ephemeral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace, ttlSeconds: 45 })
      });
      const data = await res.json();
      if (data.success) {
        await fetchMemories();
        await fetchHealth();
        setActiveTab('hub');
      }
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070c16] text-slate-100 flex flex-col">
      
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        workspace={workspace}
        setWorkspace={setWorkspace}
        health={health}
        lastEvent={streamEvents[0]}
        onReseed={handleReseed}
        loading={loading}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'demo' && (
          <DemoWalkthrough
            onSelectTab={setActiveTab}
            onInspectMemory={setInspectingMemoryId}
            onRefreshAll={() => {
              fetchMemories();
              fetchHealth();
            }}
          />
        )}

        {activeTab === 'agent' && (
          <AgentSession
            workspace={workspace}
            onInspectMemory={setInspectingMemoryId}
            onTriggerMistake={handleTriggerMistake}
            onTriggerCorrection={handleTriggerCorrection}
            onTriggerEphemeral={handleTriggerEphemeral}
            loading={loading}
          />
        )}

        {activeTab === 'hub' && (
          <MemoryHub
            memories={memories}
            workspace={workspace}
            setWorkspace={setWorkspace}
            onInspectMemory={setInspectingMemoryId}
            onRefresh={fetchMemories}
            loading={loading}
          />
        )}

        {activeTab === 'arch' && (
          <ArchitectureDocs />
        )}
      </main>

      {/* Memory Deep Inspector Modal */}
      {inspectingMemoryId && (
        <MemoryInspectorModal
          memoryId={inspectingMemoryId}
          onClose={() => setInspectingMemoryId(null)}
          onRefresh={() => {
            fetchMemories();
            fetchHealth();
          }}
        />
      )}

      {/* Real-time Change Stream Ticker Drawer */}
      <LiveStreamDrawer streamEvents={streamEvents} />

    </div>
  );
}
