/**
 * Memory Model and Repository for DevMemory
 * Implements MongoDB Atlas document modeling, Vector Search retrieval with metadata filters,
 * and seamless resilient in-memory fallback to prevent downtime if IP whitelist rotates.
 */

const { ObjectId } = require('mongodb');
const dbManager = require('./db');
const { getEmbedding, cosineSimilarity } = require('./embeddings');
const { SEED_MEMORIES } = require('./seed');

class MemoryRepository {
  constructor() {
    // In-memory store initialized with seed memories as high-availability fallback
    this.localStore = [];
    this.initLocalStore();

    dbManager.on('connection_restored', async () => {
      console.log('[MemoryRepo] Syncing local memories with Atlas...');
      try {
        for (const mem of this.localStore) {
          const exists = await dbManager.memoriesCollection.findOne({ _id: mem._id });
          if (!exists) {
            await dbManager.memoriesCollection.insertOne(mem);
          }
        }
      } catch (e) {
        console.warn('[MemoryRepo] Sync warning:', e.message);
      }
    });
  }

  async initLocalStore() {
    for (const data of SEED_MEMORIES) {
      const doc = await this.buildMemoryDocument(data);
      doc._id = new ObjectId();
      this.localStore.push(doc);
    }
  }

  get isLiveAtlas() {
    return dbManager.isConnected && dbManager.memoriesCollection;
  }

  get collection() {
    return dbManager.memoriesCollection;
  }

  /**
   * Format and validate memory document
   */
  async buildMemoryDocument(data) {
    const textToEmbed = [
      data.content?.title || '',
      data.content?.problem || '',
      data.content?.attemptedFix || '',
      data.content?.outcome || '',
      data.content?.recommendation || '',
      (data.lifecycle?.tags || []).join(' ')
    ].join(' ').trim();

    const embedding = data.embedding && Array.isArray(data.embedding) && data.embedding.length === 384
      ? data.embedding
      : await getEmbedding(textToEmbed);

    const now = new Date();

    return {
      owner: data.owner || 'developer',
      workspace: data.workspace || 'auth-service',
      type: data.type || 'failed_fix',
      content: {
        title: data.content?.title || 'Untitled Memory',
        problem: data.content?.problem || '',
        attemptedFix: data.content?.attemptedFix || '',
        outcome: data.content?.outcome || '',
        recommendation: data.content?.recommendation || '',
        codeSnippet: data.content?.codeSnippet || '',
        affectedFiles: data.content?.affectedFiles || []
      },
      source: {
        sessionId: data.source?.sessionId || 'session-' + Date.now(),
        channel: data.source?.channel || 'interactive_agent',
        author: data.source?.author || 'DevMemory'
      },
      lifecycle: {
        status: data.lifecycle?.status || 'active',
        confidence: typeof data.lifecycle?.confidence === 'number' ? data.lifecycle.confidence : 0.95,
        supersededBy: data.lifecycle?.supersededBy ? new ObjectId(data.lifecycle.supersededBy) : null,
        supersededReason: data.lifecycle?.supersededReason || null,
        expiresAt: data.lifecycle?.expiresAt ? new Date(data.lifecycle.expiresAt) : null,
        tags: Array.isArray(data.lifecycle?.tags) ? data.lifecycle.tags : [],
        privacy: data.lifecycle?.privacy || 'workspace_public'
      },
      embedding: embedding,
      recallStats: {
        recallsCount: data.recallStats?.recallsCount || 0,
        lastRecalledAt: data.recallStats?.lastRecalledAt ? new Date(data.recallStats.lastRecalledAt) : null,
        recentRecalls: data.recallStats?.recentRecalls || []
      },
      createdAt: data.createdAt ? new Date(data.createdAt) : now,
      updatedAt: now
    };
  }

  /**
   * Create a new memory
   */
  async createMemory(data) {
    const doc = await this.buildMemoryDocument(data);
    doc._id = new ObjectId();

    // Always update local store
    this.localStore.unshift(doc);

    // If Atlas is connected, insert to Atlas
    if (this.isLiveAtlas) {
      try {
        await this.collection.insertOne(doc);
      } catch (err) {
        console.warn('[MongoDB Atlas] Insert failed, kept in resilient local store:', err.message);
      }
    }

    // Broadcast change event for real-time SSE updates
    dbManager.emit('memory_change', {
      operationType: 'insert',
      documentId: doc._id,
      fullDocument: doc
    });

    return doc;
  }

  /**
   * Find by ID
   */
  async getById(id) {
    const strId = id.toString();
    if (this.isLiveAtlas) {
      try {
        const query = typeof id === 'string' ? { _id: new ObjectId(id) } : { _id: id };
        const found = await this.collection.findOne(query);
        if (found) return found;
      } catch (err) {
        // Fallback to local
      }
    }
    return this.localStore.find(m => m._id.toString() === strId) || null;
  }

  async getMemory(id) {
    return this.getById(id);
  }

  /**
   * List memories with metadata filters
   */
  async listMemories(filters = {}, options = {}) {
    if (this.isLiveAtlas) {
      try {
        const mongoQuery = {};
        if (filters.workspace && filters.workspace !== 'all') {
          mongoQuery.workspace = filters.workspace;
        }
        if (filters.status && filters.status !== 'all') {
          mongoQuery['lifecycle.status'] = filters.status;
        }
        if (filters.type && filters.type !== 'all') {
          mongoQuery.type = filters.type;
        }
        if (filters.search) {
          mongoQuery['$or'] = [
            { 'content.title': { $regex: filters.search, $options: 'i' } },
            { 'content.problem': { $regex: filters.search, $options: 'i' } },
            { 'content.recommendation': { $regex: filters.search, $options: 'i' } }
          ];
        }

        return await this.collection
          .find(mongoQuery)
          .sort(options.sort || { createdAt: -1 })
          .limit(options.limit || 50)
          .toArray();
      } catch (err) {
        console.warn('[MongoDB Atlas] Query error, using resilient local store:', err.message);
      }
    }

    // Local in-memory filter
    return this.localStore.filter(m => {
      if (filters.workspace && filters.workspace !== 'all' && m.workspace !== filters.workspace) return false;
      if (filters.status && filters.status !== 'all' && m.lifecycle?.status !== filters.status) return false;
      if (filters.type && filters.type !== 'all' && m.type !== filters.type) return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const matchTitle = m.content?.title?.toLowerCase().includes(q);
        const matchProblem = m.content?.problem?.toLowerCase().includes(q);
        const matchRec = m.content?.recommendation?.toLowerCase().includes(q);
        if (!matchTitle && !matchProblem && !matchRec) return false;
      }
      return true;
    });
  }

  /**
   * Semantic Recall using Vector Search
   */
  async vectorSearch({
    query,
    workspace,
    status = 'active',
    types = null,
    limit = 5,
    minScore = 0.45
  }) {
    const queryEmbedding = await getEmbedding(query);

    // Try Atlas $vectorSearch if Atlas is active
    if (this.isLiveAtlas && dbManager.vectorIndexReady) {
      try {
        const filterConditions = {};
        if (workspace && workspace !== 'all') filterConditions.workspace = workspace;
        if (status) filterConditions['lifecycle.status'] = status;
        if (types && types.length > 0) filterConditions.type = { $in: types };

        const pipeline = [
          {
            $vectorSearch: {
              index: 'vector_index',
              path: 'embedding',
              queryVector: queryEmbedding,
              numCandidates: 50,
              limit: limit * 2,
              filter: filterConditions
            }
          },
          {
            $project: {
              score: { $meta: 'vectorSearchScore' },
              document: '$$ROOT'
            }
          }
        ];

        const results = await this.collection.aggregate(pipeline).toArray();
        if (results && results.length > 0) {
          return results
            .filter(r => r.score >= minScore)
            .slice(0, limit)
            .map(r => ({
              ...r.document,
              relevanceScore: parseFloat(r.score.toFixed(4)),
              retrievalMethod: 'atlas_vectorSearch'
            }));
        }
      } catch (err) {
        // Fallback to local cosine calculation
      }
    }

    // Resilient local cosine similarity retrieval
    const candidates = await this.listMemories({ workspace, status, types });
    const scored = candidates.map(doc => {
      const score = cosineSimilarity(queryEmbedding, doc.embedding || []);
      return {
        ...doc,
        relevanceScore: parseFloat(score.toFixed(4)),
        retrievalMethod: 'resilient_vector_search'
      };
    });

    scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
    return scored.filter(doc => doc.relevanceScore >= minScore).slice(0, limit);
  }

  /**
   * Record recall telemetry
   */
  async recordRecall(id, sessionId, queryText, relevanceScore) {
    const now = new Date();
    const strId = id.toString();

    // Update local store
    const localDoc = this.localStore.find(m => m._id.toString() === strId);
    if (localDoc) {
      localDoc.recallStats = localDoc.recallStats || { recallsCount: 0, recentRecalls: [] };
      localDoc.recallStats.recallsCount = (localDoc.recallStats.recallsCount || 0) + 1;
      localDoc.recallStats.lastRecalledAt = now;
      localDoc.recallStats.recentRecalls.unshift({
        recalledAt: now,
        sessionId,
        query: (queryText || '').slice(0, 200),
        relevanceScore: parseFloat(relevanceScore?.toFixed(4) || 0)
      });
    }

    if (this.isLiveAtlas) {
      try {
        await this.collection.updateOne(
          { _id: new ObjectId(strId) },
          {
            $inc: { 'recallStats.recallsCount': 1 },
            $set: { 'recallStats.lastRecalledAt': now, updatedAt: now }
          }
        );
      } catch (e) {
        // Ignored in fallback
      }
    }
  }

  /**
   * Delete memory
   */
  async deleteMemory(id, hard = false) {
    const strId = id.toString();
    this.localStore = this.localStore.filter(m => m._id.toString() !== strId);

    if (this.isLiveAtlas) {
      try {
        if (hard) {
          await this.collection.deleteOne({ _id: new ObjectId(strId) });
        } else {
          await this.collection.updateOne(
            { _id: new ObjectId(strId) },
            { $set: { 'lifecycle.status': 'invalidated', updatedAt: new Date() } }
          );
        }
      } catch (e) {
        // Ignored in fallback
      }
    }

    dbManager.emit('memory_change', {
      operationType: hard ? 'delete' : 'update',
      documentId: strId
    });
  }

  /**
   * Update an existing memory document and refresh its vector embedding
   */
  async updateMemory(id, updates) {
    const strId = id.toString();
    const now = new Date();

    let doc = await this.getById(id);
    if (!doc) return null;

    // Merge content
    if (updates.content) {
      doc.content = {
        ...doc.content,
        ...updates.content,
        title: updates.content.title || doc.content.title,
        recommendation: updates.content.recommendation || doc.content.recommendation,
        problem: updates.content.problem || doc.content.problem
      };
    }
    if (updates.type) doc.type = updates.type;
    if (updates.lifecycle) {
      doc.lifecycle = {
        ...doc.lifecycle,
        ...updates.lifecycle,
        tags: Array.from(new Set([...(doc.lifecycle?.tags || []), ...(updates.lifecycle?.tags || [])]))
      };
    }
    doc.updatedAt = now;

    // Recalculate 384-dimensional vector embedding with updated content
    const textToEmbed = [
      doc.content.title || '',
      doc.content.problem || '',
      doc.content.recommendation || '',
      (doc.lifecycle?.tags || []).join(' ')
    ].join(' ').trim();
    doc.embedding = await getEmbedding(textToEmbed);

    // Update in localStore
    const idx = this.localStore.findIndex(m => m._id.toString() === strId);
    if (idx !== -1) {
      this.localStore[idx] = doc;
    }

    // Update in Atlas
    if (this.isLiveAtlas) {
      try {
        await this.collection.updateOne(
          { _id: new ObjectId(strId) },
          {
            $set: {
              content: doc.content,
              type: doc.type,
              lifecycle: doc.lifecycle,
              embedding: doc.embedding,
              updatedAt: now
            }
          }
        );
      } catch (err) {
        console.warn('[MongoDB Atlas] Update warning:', err.message);
      }
    }

    dbManager.emit('memory_change', {
      operationType: 'update',
      documentId: strId,
      fullDocument: doc
    });

    console.log(`[MemoryRepo] Updated existing memory document: "${doc.content.title}" (#${strId.slice(-6)})`);
    return doc;
  }

  /**
   * Deduplicate: If an existing memory is closely related (similarity >= 0.68),
   * update it instead of creating an annoying duplicate!
   */
  async upsertOrMergeMemory(data) {
    let targetMemory = null;

    // 1. If an explicit target memory ID was passed (e.g. from an override flow)
    if (data.targetMemoryId) {
      targetMemory = await this.getMemory(data.targetMemoryId);
    }

    // 2. Otherwise search for an existing related memory via vector search
    if (!targetMemory) {
      const textToMatch = [
        data.content?.title || '',
        data.content?.recommendation || ''
      ].join(' ').trim();

      const matches = await this.vectorSearch({
        query: textToMatch,
        status: 'active',
        limit: 1,
        minScore: data.isOverride ? 0.45 : 0.68
      });

      if (matches && matches.length > 0) {
        targetMemory = matches[0];
      }
    }

    if (targetMemory) {
      console.log(`[MemoryRepo] Found existing related memory (#${targetMemory._id.toString().slice(-6)} - "${targetMemory.content.title}"). Updating to prevent redundancy.`);

      const isOverride = data.isOverride || (data.lifecycle?.tags || []).includes('updated-rule');
      const updatedRecommendation = isOverride
        ? data.content.recommendation
        : (data.content?.recommendation && data.content.recommendation !== targetMemory.content.recommendation
          ? `${targetMemory.content.recommendation} | Updated rule: ${data.content.recommendation}`
          : targetMemory.content.recommendation);

      const updated = await this.updateMemory(targetMemory._id, {
        content: {
          title: isOverride && data.content?.title ? data.content.title : targetMemory.content.title,
          problem: isOverride && data.content?.problem ? data.content.problem : targetMemory.content.problem,
          recommendation: updatedRecommendation,
          codeSnippet: data.content?.codeSnippet || targetMemory.content.codeSnippet
        },
        type: data.type || targetMemory.type,
        lifecycle: {
          tags: data.lifecycle?.tags || []
        }
      });

      return { memory: updated, isUpdated: true, existingId: targetMemory._id };
    }

    // If no existing related memory, create a new one
    const created = await this.createMemory(data);
    return { memory: created, isUpdated: false };
  }
}

module.exports = new MemoryRepository();
