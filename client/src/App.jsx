import React, { useState, useEffect, useCallback } from 'react';
import Navbar from './components/Navbar';
import AgentSession from './components/AgentSession';
import MemoryHub from './components/MemoryHub';
import MemoryInspectorModal from './components/MemoryInspectorModal';
import RecordMemoryModal from './components/RecordMemoryModal';
import SettingsModal from './components/SettingsModal';

export default function App() {
  const [activeTab, setActiveTab] = useState('assistant');
  const [workspace, setWorkspace] = useState('auth-service');
  const [memories, setMemories] = useState([]);
  const [health, setHealth] = useState(null);
  const [inspectingMemoryId, setInspectingMemoryId] = useState(null);
  const [recordModalOpen, setRecordModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Fetch memories from MongoDB
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

  // Fetch health
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

  useEffect(() => {
    fetchMemories();
    fetchHealth();

    // SSE connection for real-time memory updates
    const eventSource = new EventSource('/api/stream');

    eventSource.addEventListener('memory_change', () => {
      fetchMemories();
      fetchHealth();
    });

    return () => {
      eventSource.close();
    };
  }, [fetchMemories, fetchHealth]);

  const handleMemoryCreated = (newMemory) => {
    fetchMemories();
    fetchHealth();
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col font-sans">
      
      {/* Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        workspace={workspace}
        setWorkspace={setWorkspace}
        health={health}
        onOpenRecordModal={() => setRecordModalOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6">
        {activeTab === 'assistant' && (
          <AgentSession
            workspace={workspace}
            onInspectMemory={setInspectingMemoryId}
            onOpenRecordModal={() => setRecordModalOpen(true)}
          />
        )}

        {activeTab === 'repository' && (
          <MemoryHub
            memories={memories}
            workspace={workspace}
            setWorkspace={setWorkspace}
            onInspectMemory={setInspectingMemoryId}
            onOpenRecordModal={() => setRecordModalOpen(true)}
            onRefresh={fetchMemories}
          />
        )}
      </main>

      {/* Memory Inspector Modal */}
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

      {/* Record New Bug/Rule Modal */}
      <RecordMemoryModal
        isOpen={recordModalOpen}
        onClose={() => setRecordModalOpen(false)}
        currentWorkspace={workspace}
        onCreated={handleMemoryCreated}
      />

      {/* AI Model Settings Modal */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

    </div>
  );
}
