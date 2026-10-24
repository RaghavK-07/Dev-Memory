const { MongoClient } = require('mongodb');
const EventEmitter = require('events');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME || 'devmemory_db';

class DatabaseManager extends EventEmitter {
  constructor() {
    super();
    this.client = null;
    this.db = null;
    this.memoriesCollection = null;
    this.sessionsCollection = null;
    this.workspacesCollection = null;
    this.changeStream = null;
    this.isConnected = false;
    this.vectorIndexReady = false;
  }

  async connect() {
    if (this.isConnected && this.client) {
      return this.db;
    }

    if (!uri) {
      throw new Error('MONGODB_URI is not set in environment or .env');
    }

    try {
      this.client = new MongoClient(uri, {
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
      });

      await this.client.connect();
      this.db = this.client.db(dbName);
      this.memoriesCollection = this.db.collection('memories');
      this.sessionsCollection = this.db.collection('sessions');
      this.workspacesCollection = this.db.collection('workspaces');
      this.isConnected = true;

      console.log(`[MongoDB] Connected successfully to database: ${dbName}`);

      // Ensure TTL and Standard Indexes
      await this.setupIndexes();

      // Check Vector Search status
      await this.checkVectorSearch();

      // Start Change Stream listener
      this.initChangeStream();

      return this.db;
    } catch (err) {
      this.isConnected = false;
      console.error('[MongoDB] Connection error:', err.message);
      throw err;
    }
  }

  async setupIndexes() {
    try {
      console.log('[MongoDB] Setting up database indexes...');

      // 1. TTL Index for time-based memory expiry (Challenge requirement)
      // Any document with lifecycle.expiresAt set will be automatically removed by MongoDB
      // when current time >= expiresAt.
      await this.memoriesCollection.createIndex(
        { "lifecycle.expiresAt": 1 },
        { expireAfterSeconds: 0, name: "ttl_expiresAt_idx" }
      );
      console.log('[MongoDB] TTL Index created: ttl_expiresAt_idx (lifecycle.expiresAt)');

      // 2. Performance and filtering indexes
      await this.memoriesCollection.createIndex(
        { workspace: 1, "lifecycle.status": 1, type: 1 },
        { name: "workspace_status_type_idx" }
      );

      await this.memoriesCollection.createIndex(
        { "source.sessionId": 1 },
        { name: "sessionId_idx" }
      );

      await this.memoriesCollection.createIndex(
        { "lifecycle.status": 1, createdAt: -1 },
        { name: "status_created_idx" }
      );

      console.log('[MongoDB] All standard indexes verified.');
    } catch (err) {
      console.warn('[MongoDB] Index setup warning:', err.message);
    }
  }

  async checkVectorSearch() {
    try {
      // Check if Atlas Search / Vector Search index exists
      const indexes = await this.memoriesCollection.listSearchIndexes().toArray();
      const hasVector = indexes.some(idx => idx.name === 'vector_index' && idx.status === 'READY');
      this.vectorIndexReady = hasVector;
      console.log(`[MongoDB] Search indexes found: ${indexes.length}. vector_index ready: ${hasVector}`);
    } catch (err) {
      // Search index command might not be supported on some tiers or unindexed collections
      this.vectorIndexReady = false;
      console.log('[MongoDB] Vector Search index check (Atlas Search): Not detected or building. Application hybrid similarity fallback will be active.');
    }
  }

  initChangeStream() {
    try {
      // MongoDB Change Streams for real-time reactivity
      // Watched by UI and multi-agent coordination
      this.changeStream = this.memoriesCollection.watch([], { fullDocument: 'updateLookup' });

      this.changeStream.on('change', (change) => {
        const eventData = {
          operationType: change.operationType,
          documentId: change.documentKey._id,
          fullDocument: change.fullDocument,
          updateDescription: change.updateDescription,
          wallTime: change.wallTime || new Date(),
        };

        // Emit local event for SSE subscribers
        this.emit('memory_change', eventData);
        console.log(`[Change Stream] Detected ${change.operationType} on memory: ${change.documentKey._id}`);
      });

      this.changeStream.on('error', (err) => {
        console.warn('[Change Stream] Stream error:', err.message);
      });

      console.log('[MongoDB] Change Stream initialized on memories collection');
    } catch (err) {
      console.warn('[MongoDB] Change stream initialization skipped (replica set required):', err.message);
    }
  }

  async getHealth() {
    if (!this.isConnected || !this.db) {
      return { status: 'disconnected', uri: uri ? uri.replace(/:([^:@]+)@/, ':****@') : null };
    }

    try {
      const ping = await this.db.command({ ping: 1 });
      const memoryCount = await this.memoriesCollection.countDocuments();
      const activeCount = await this.memoriesCollection.countDocuments({ "lifecycle.status": "active" });
      const supersededCount = await this.memoriesCollection.countDocuments({ "lifecycle.status": "superseded" });
      const indexes = await this.memoriesCollection.indexes();

      return {
        status: 'connected',
        cluster: 'MongoDB Atlas',
        database: dbName,
        ping: ping.ok === 1 ? 'OK' : 'FAIL',
        vectorIndexReady: this.vectorIndexReady,
        counts: {
          total: memoryCount,
          active: activeCount,
          superseded: supersededCount
        },
        indexes: indexes.map(idx => idx.name)
      };
    } catch (err) {
      return { status: 'error', error: err.message };
    }
  }
}

const dbManager = new DatabaseManager();
module.exports = dbManager;
