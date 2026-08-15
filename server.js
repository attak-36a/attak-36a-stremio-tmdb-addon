// server.js - for local dev and persistent hosts (Render, Railway, Fly.io, a VPS, etc.)
require('dotenv').config();
const { serveHTTP } = require('stremio-addon-sdk');
const addonInterface = require('./addon');

const PORT = process.env.PORT || 7000;

serveHTTP(addonInterface, { port: PORT });

console.log(`Addon running.`);
console.log(`Install locally in Stremio via: http://127.0.0.1:${PORT}/manifest.json`);
