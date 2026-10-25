const dbManager = require('../server/db');
const app = require('../server/index');

let isConnected = false;

module.exports = async (req, res) => {
  if (!isConnected) {
    try {
      await dbManager.connect();
      isConnected = true;
    } catch (err) {
      console.warn('[Vercel Serverless] DB connection note:', err.message);
    }
  }

  // URL normalization if rewritten by Vercel
  if (req.url === '/api' || req.url === '/api/' || req.url === '/api/index.js') {
    if (req.headers['x-matched-path']) {
      req.url = req.headers['x-matched-path'];
    }
  }

  return app(req, res);
};
