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
  return app(req, res);
};
