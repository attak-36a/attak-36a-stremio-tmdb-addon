// api/[...stremio].js - Vercel serverless entrypoint
// Vercel doesn't run a long-lived server, so we use the SDK's router
// instead of serveHTTP().
const { getRouter } = require('stremio-addon-sdk');
const addonInterface = require('../addon');

const router = getRouter(addonInterface);

module.exports = (req, res) => {
  router(req, res, () => {
    res.statusCode = 404;
    res.end('Not found');
  });
};
