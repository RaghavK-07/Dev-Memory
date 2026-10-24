import React, { useState } from 'react';
import { Database, Copy, Check, Terminal, Layers, Clock, Radio, Cpu, ExternalLink } from 'lucide-react';

export default function ArchitectureDocs() {
  const [copiedIndex, setCopiedIndex] = useState(false);

  const vectorSearchIndexDef = {
    name: "vector_index",
    type: "vectorSearch",
    definition: {
      fields: [
        {
          type: "vector",
          path: "embedding",
          numDimensions: 384,
          similarity: "cosine"
        },
        {
          type: "filter",
          path: "workspace"
        },
        {
          type: "filter",
          path: "lifecycle.status"
        },
        {
          type: "filter",
          path: "type"
        },
        {
          type: "filter",
          path: "lifecycle.privacy"
        }
      ]
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(vectorSearchIndexDef, null, 2));
    setCopiedIndex(true);
    setTimeout(() => setCopiedIndex(false), 2000);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 py-4">
      
      {/* Title */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2.5 py-0.5 rounded text-xs font-mono bg-mongo-slate text-mongo-green border border-mongo-green/30">
            Technical Architecture
          </span>
          <span className="text-xs text-slate-400 font-mono">DevMemory on MongoDB Atlas</span>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">
          System Design, Vector Search & Data Modeling
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl">
          Complete breakdown of how DevMemory implements MongoDB Document Modeling, Vector Search indexes, TTL-based expiry, and real-time Change Streams.
        </p>
      </div>

      {/* 4 Pillar Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        
        {/* Pillar 1: Document Model */}
        <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 space-y-3">
          <div className="flex items-center gap-2 text-mongo-green font-semibold text-sm">
            <Layers className="w-4 h-4" />
            <span>1. Memory Document Model</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Every memory is a rich MongoDB document containing owner, workspace, type, structured problem/solution content, source provenance, lifecycle metadata, and a 384-dimensional vector embedding.
          </p>
          <div className="p-3 rounded-xl bg-slate-950 font-mono text-[11px] text-slate-400 space-y-1">
            <div>• <code className="text-white">type</code>: failed_fix | constraint | convention | architecture</div>
            <div>• <code className="text-white">lifecycle.status</code>: active | superseded | expired | invalidated</div>
            <div>• <code className="text-white">lifecycle.supersededBy</code>: ObjectId ref to replacing memory</div>
            <div>• <code className="text-white">lifecycle.expiresAt</code>: ISODate (TTL index target)</div>
            <div>• <code className="text-white">embedding</code>: Array[384] float values</div>
          </div>
        </div>

        {/* Pillar 2: Vector Search */}
        <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 space-y-3">
          <div className="flex items-center gap-2 text-mongo-green font-semibold text-sm">
            <Cpu className="w-4 h-4" />
            <span>2. MongoDB Vector Search</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Semantic recall using MongoDB's <code className="text-mongo-green font-mono">$vectorSearch</code> aggregation stage, combined with pre-filtering on workspace and lifecycle status to eliminate hallucinated context.
          </p>
          <div className="p-3 rounded-xl bg-slate-950 font-mono text-[11px] text-slate-400 space-y-1">
            <div>• Cosine similarity over 384 dimensions</div>
            <div>• Scoped to repository boundaries (<code className="text-white">workspace</code>)</div>
            <div>• Only active documents retrieved (<code className="text-white">status: "active"</code>)</div>
            <div>• Integrated recall counter & history telemetry</div>
          </div>
        </div>

        {/* Pillar 3: TTL Index */}
        <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 space-y-3">
          <div className="flex items-center gap-2 text-mongo-green font-semibold text-sm">
            <Clock className="w-4 h-4" />
            <span>3. TTL Index Memory Expiry</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Time-based expiry is natively delegated to MongoDB's TTL index. Documents with a specified <code className="text-mongo-green font-mono">expiresAt</code> timestamp are automatically reaped by MongoDB's background thread.
          </p>
          <div className="p-3 rounded-xl bg-slate-950 font-mono text-[11px] text-emerald-300">
            db.memories.createIndex(<br />
            &nbsp;&nbsp;{'{ "lifecycle.expiresAt": 1 }'},<br />
            &nbsp;&nbsp;{'{ expireAfterSeconds: 0, name: "ttl_expiresAt_idx" }'}<br />
            )
          </div>
        </div>

        {/* Pillar 4: Change Streams */}
        <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 space-y-3">
          <div className="flex items-center gap-2 text-mongo-green font-semibold text-sm">
            <Radio className="w-4 h-4" />
            <span>4. Reactive Change Streams</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            MongoDB Change Streams listen to all inserts, updates, and supersedes across the cluster, pushing real-time Server-Sent Events (SSE) to every connected developer and agent session.
          </p>
          <div className="p-3 rounded-xl bg-slate-950 font-mono text-[11px] text-emerald-300">
            const stream = memoriesCollection.watch([], {'{'}<br />
            &nbsp;&nbsp;fullDocument: 'updateLookup'<br />
            {'}'});<br />
            stream.on('change', (event) =&gt; sse.broadcast(event));
          </div>
        </div>

      </div>

      {/* Atlas Vector Search Index JSON Specifier */}
      <div className="bg-slate-900/60 rounded-3xl border border-slate-800 p-6 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-mongo-green" />
            <h3 className="text-sm font-semibold text-white">MongoDB Atlas Vector Search Index Definition</h3>
          </div>
          <button
            onClick={handleCopy}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-300 transition flex items-center gap-1.5"
          >
            {copiedIndex ? <Check className="w-3.5 h-3.5 text-mongo-green" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedIndex ? 'Copied Definition' : 'Copy JSON'}</span>
          </button>
        </div>

        <p className="text-xs text-slate-400">
          In MongoDB Atlas &rarr; Clusters &rarr; Atlas Search &rarr; Create Search Index &rarr; JSON Editor:
        </p>

        <pre className="p-4 rounded-2xl bg-slate-950 border border-slate-800 overflow-x-auto text-xs font-mono text-emerald-300">
          {JSON.stringify(vectorSearchIndexDef, null, 2)}
        </pre>
      </div>

    </div>
  );
}
