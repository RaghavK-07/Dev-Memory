const { MongoClient } = require('mongodb');
const EventEmitter = require('events');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const DEFAULT_MONGODB_URI = 'mongodb+srv://raghavkceo_db_user:2dOmM3FUlGyACMFW@cluster0.ecalgvs.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const uri = process.env.MONGODB_URI || DEFAULT_MONGODB_URI;
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
    this.atlasError = null;
    this.retryTimer = null;
  }

  async connect() {
    if (this.isConnected && this.client) {
      return this.db;
    }

    if (!uri) {
      console.warn('[MongoDB] MONGODB_URI not set. Running in local memory mode.');
      this.isConnected = false;
      return null;
    }

    try {
      this.client = new MongoClient(uri, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
        maxIdleTimeMS: 20000,
        socketTimeoutMS: 30000,
        family: 4
      });

      await this.client.connect();
      this.db = this.client.db(dbName);
      this.memoriesCollection = this.db.collection('memories');
      this.sessionsCollection = this.db.collection('sessions');
      this.workspacesCollection = this.db.collection('workspaces');
      this.isConnected = true;
      this.atlasError = null;

      console.log(`[MongoDB] Connected successfully to database: ${dbName}`);

      await this.setupIndexes();
      await this.checkVectorSearch();
      this.initChangeStream();

      return this.db;
    } catch (err) {
      this.isConnected = false;
      this.atlasError = err.message;
      console.warn(`[MongoDB] Atlas connection warning: ${err.message}`);
      if (err.message.includes('alert number 80') || err.message.includes('SSL alert') || err.message.includes('ServerSelectionError')) {
        console.warn('-> This occurs when the current IP is not whitelisted in MongoDB Atlas Network Access.');
        console.warn('-> DevMemory is operating in Resilient Local Store mode and will auto-reconnect once IP is whitelisted.');
      }

      // Schedule background reconnection attempts
      this.scheduleReconnect();
      return null;
    }
  }

  scheduleReconnect() {
    if (this.retryTimer) return;
    this.retryTimer = setInterval(async () => {
      if (this.isConnected) {
        clearInterval(this.retryTimer);
        this.retryTimer = null;
        return;
      }
      try {
        const testClient = new MongoClient(uri, {
          serverSelectionTimeoutMS: 4000,
          connectTimeoutMS: 4000,
          family: 4
        });
        await testClient.connect();
        console.log('[MongoDB] Atlas connection restored! Switching back to live Atlas cluster.');
        testClient.close();
        await this.connect();
        if (this.isConnected) {
          clearInterval(this.retryTimer);
          this.retryTimer = null;
          this.emit('connection_restored');
        }
      } catch (e) {
        // Still waiting for IP whitelist
      }
    }, 15000);
  }

  async setupIndexes() {
    if (!this.memoriesCollection) return;
    try {
      await this.memoriesCollection.createIndex(
        { "lifecycle.expiresAt": 1 },
        { expireAfterSeconds: 0, name: "ttl_expiresAt_idx" }
      );
      await this.memoriesCollection.createIndex(
        { workspace: 1, "lifecycle.status": 1, type: 1 },
        { name: "workspace_status_type_idx" }
      );
      await this.memoriesCollection.createIndex(
        { "source.sessionId": 1 },
        { name: "sessionId_idx" }
      );
    } catch (err) {
      console.warn('[MongoDB] Index setup note:', err.message);
    }
  }

  async checkVectorSearch() {
    if (!this.memoriesCollection) return;
    try {
      const indexes = await this.memoriesCollection.listSearchIndexes().toArray();
      this.vectorIndexReady = indexes.some(idx => idx.name === 'vector_index' && idx.status === 'READY');
    } catch (err) {
      this.vectorIndexReady = false;
    }
  }

  initChangeStream() {
    if (!this.memoriesCollection) return;
    try {
      this.changeStream = this.memoriesCollection.watch([], { fullDocument: 'updateLookup' });
      this.changeStream.on('change', (change) => {
        this.emit('memory_change', {
          operationType: change.operationType,
          documentId: change.documentKey._id,
          fullDocument: change.fullDocument
        });
      });
      this.changeStream.on('error', (err) => {
        console.warn('[Change Stream] Stream paused:', err.message);
      });
    } catch (err) {
      console.warn('[MongoDB] Change stream paused:', err.message);
    }
  }

  async getHealth() {
    if (!this.isConnected || !this.db) {
      let total = 0;
      let active = 0;
      let superseded = 0;
      try {
        const memoryRepo = require('./memoryModel');
        total = memoryRepo.localStore.length;
        active = memoryRepo.localStore.filter(m => m.lifecycle?.status === 'active').length;
        superseded = memoryRepo.localStore.filter(m => m.lifecycle?.status === 'superseded').length;
      } catch (e) {}

      return {
        status: 'fallback_active',
        cluster: 'Resilient Local Storage (Atlas IP Whitelist Required)',
        database: dbName,
        ping: 'LOCAL_FALLBACK',
        atlasError: this.atlasError,
        vectorIndexReady: false,
        counts: {
          total,
          active,
          superseded
        }
      };
    }

    try {
      const ping = await this.db.command({ ping: 1 });
      const memoryCount = await this.memoriesCollection.countDocuments();
      const activeCount = await this.memoriesCollection.countDocuments({ "lifecycle.status": "active" });
      const supersededCount = await this.memoriesCollection.countDocuments({ "lifecycle.status": "superseded" });

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
        }
      };
    } catch (err) {
      return { status: 'fallback_active', error: err.message };
    }
  }
}

const dbManager = new DatabaseManager();
module.exports = dbManager;
