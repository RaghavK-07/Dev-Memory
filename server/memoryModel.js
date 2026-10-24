/**
 * Memory Model and Repository for DevMemory
 * Implements MongoDB document modeling, lifecycle management,
 * Vector Search retrieval with metadata filters, and TTL-aware operations.
 */

const { ObjectId } = require('mongodb');
const dbManager = require('./db');
const { getEmbedding, cosineSimilarity } = require('./embeddings');

class MemoryRepository {
  get collection() {
    if (!dbManager.memoriesCollection) {
      throw new Error('Database not connected. Call dbManager.connect() first.');
    }
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
      owner: data.owner || 'dev-agent-01',
      workspace: data.workspace || 'auth-service',
      type: data.type || 'failed_fix', // failed_fix | successful_solution | constraint | convention | architecture | decision
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
        author: data.source?.author || 'Agent DevMemory'
      },
      lifecycle: {
        status: data.lifecycle?.status || 'active', // active | superseded | expired | invalidated
        confidence: typeof data.lifecycle?.confidence === 'number' ? data.lifecycle.confidence : 0.95,
        supersededBy: data.lifecycle?.supersededBy ? new ObjectId(data.lifecycle.supersededBy) : null,
        supersededReason: data.lifecycle?.supersededReason || null,
        expiresAt: data.lifecycle?.expiresAt ? new Date(data.lifecycle.expiresAt) : null, // MongoDB TTL index target
        tags: Array.isArray(data.lifecycle?.tags) ? data.lifecycle.tags : [],
        privacy: data.lifecycle?.privacy || 'workspace_public' // workspace_public | team_only | private
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
    const result = await this.collection.insertOne(doc);
    return { ...doc, _id: result.insertedId };
  }

  /**
   * Find by ID
   */
  async getById(id) {
    const query = typeof id === 'string' ? { _id: new ObjectId(id) } : { _id: id };
    return await this.collection.findOne(query);
  }

  /**
   * List memories with metadata filters
   */
  async listMemories(filters = {}, options = {}) {
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
    if (filters.owner) {
      mongoQuery.owner = filters.owner;
    }
    if (filters.search) {
      mongoQuery['$or'] = [
        { 'content.title': { $regex: filters.search, $options: 'i' } },
        { 'content.problem': { $regex: filters.search, $options: 'i' } },
        { 'content.recommendation': { $regex: filters.search, $options: 'i' } },
        { 'lifecycle.tags': { $regex: filters.search, $options: 'i' } }
      ];
    }

    const sort = options.sort || { createdAt: -1 };
    const limit = options.limit || 50;
    const skip = options.skip || 0;

    return await this.collection
      .find(mongoQuery)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .toArray();
  }

  /**
   * Semantic Recall using MongoDB Vector Search ($vectorSearch)
   * With fallback to hybrid cosine re-ranking over candidate documents.
   */
  async vectorSearch({
    query,
    workspace,
    status = 'active',
    types = null,
    limit = 5,
    minScore = 0.4,
    privacyFilter = ['workspace_public', 'team_only']
  }) {
    const queryEmbedding = await getEmbedding(query);

    // Filter specifier for vector search
    const filterConditions = {};
    if (workspace && workspace !== 'all') {
      filterConditions.workspace = workspace;
    }
    if (status) {
      filterConditions['lifecycle.status'] = status;
    }
    if (types && types.length > 0) {
      filterConditions.type = { $in: types };
    }
    if (privacyFilter && privacyFilter.length > 0) {
      filterConditions['lifecycle.privacy'] = { $in: privacyFilter };
    }

    // Try MongoDB Atlas Vector Search stage
    try {
      const pipeline = [
        {
          $vectorSearch: {
            index: 'vector_index',
            path: 'embedding',
            queryVector: queryEmbedding,
            numCandidates: Math.max(limit * 10, 50),
            limit: limit * 2,
            filter: filterConditions
          }
        },
        {
          $project: {
            _id: 1,
            owner: 1,
            workspace: 1,
            type: 1,
            content: 1,
            source: 1,
            lifecycle: 1,
            recallStats: 1,
            createdAt: 1,
            score: { $meta: 'vectorSearchScore' }
          }
        }
      ];

      const results = await this.collection.aggregate(pipeline).toArray();
      if (results && results.length > 0) {
        console.log(`[Vector Search] Atlas $vectorSearch returned ${results.length} results`);
        return results
          .filter(r => r.score >= minScore)
          .slice(0, limit)
          .map(r => ({
            ...r,
            relevanceScore: parseFloat(r.score.toFixed(4)),
            retrievalMethod: 'atlas_vectorSearch'
          }));
      }
    } catch (err) {
      // Index not yet configured in Atlas or aggregation not supported in current tier
      // Gracefully fall back to client/hybrid cosine calculation over filtered candidates
    }

    // Fallback: Query filtered candidates from MongoDB, calculate cosine similarity
    const candidates = await this.collection
      .find(filterConditions)
      .limit(100)
      .toArray();

    const scored = candidates.map(doc => {
      const score = cosineSimilarity(queryEmbedding, doc.embedding || []);
      return {
        ...doc,
        relevanceScore: parseFloat(score.toFixed(4)),
        retrievalMethod: 'hybrid_mongo_vector'
      };
    });

    // Sort descending by relevance score
    scored.sort((a, b) => b.relevanceScore - a.relevanceScore);

    return scored
      .filter(doc => doc.relevanceScore >= minScore)
      .slice(0, limit);
  }

  /**
   * Record a recall event in the document history
   */
  async recordRecall(id, sessionId, queryText, relevanceScore) {
    const memoryId = typeof id === 'string' ? new ObjectId(id) : id;
    const now = new Date();

    const recallRecord = {
      recalledAt: now,
      sessionId: sessionId || 'unknown',
      query: (queryText || '').slice(0, 200),
      relevanceScore: parseFloat(relevanceScore?.toFixed(4) || 0)
    };

    return await this.collection.updateOne(
      { _id: memoryId },
      {
        $inc: { 'recallStats.recallsCount': 1 },
        $set: {
          'recallStats.lastRecalledAt': now,
          updatedAt: now
        },
        $push: {
          'recallStats.recentRecalls': {
            $each: [recallRecord],
            $slice: -10 // Keep last 10 recalls
          }
        }
      }
    );
  }

  /**
   * Supersede an old memory with a corrected/updated memory
   * Handles difficult case: conflict resolution & architectural correction
   */
  async supersedeMemory(oldMemoryId, newMemoryData, reason) {
    const oldId = typeof oldMemoryId === 'string' ? new ObjectId(oldMemoryId) : oldMemoryId;

    // 1. Create the new memory document
    const newDoc = await this.buildMemoryDocument(newMemoryData);
    const insertRes = await this.collection.insertOne(newDoc);
    const newMemoryId = insertRes.insertedId;

    // 2. Mark the previous memory as superseded
    const now = new Date();
    await this.collection.updateOne(
      { _id: oldId },
      {
        $set: {
          'lifecycle.status': 'superseded',
          'lifecycle.supersededBy': newMemoryId,
          'lifecycle.supersededReason': reason || 'Superseded by updated constraint/decision',
          updatedAt: now
        }
      }
    );

    return {
      newMemory: { ...newDoc, _id: newMemoryId },
      supersededId: oldId,
      reason
    };
  }

  /**
   * Create an ephemeral memory with TTL expiration
   */
  async createEphemeralMemory(data, ttlSeconds = 60) {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const memoryData = {
      ...data,
      lifecycle: {
        ...(data.lifecycle || {}),
        expiresAt: expiresAt,
        tags: [...(data.lifecycle?.tags || []), 'ephemeral', `ttl-${ttlSeconds}s`]
      }
    };
    return await this.createMemory(memoryData);
  }

  /**
   * Delete memory (hard or soft)
   */
  async deleteMemory(id, hard = false) {
    const query = typeof id === 'string' ? { _id: new ObjectId(id) } : { _id: id };
    if (hard) {
      return await this.collection.deleteOne(query);
    }
    // Soft delete / invalidate
    return await this.collection.updateOne(query, {
      $set: {
        'lifecycle.status': 'invalidated',
        updatedAt: new Date()
      }
    });
  }
}

module.exports = new MemoryRepository();
