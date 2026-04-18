// Re-export so PM2 can be invoked as `pm2 start ecosystem.config.js` from the repo root.
// The authoritative config lives at infra/pm2/ecosystem.config.js.
module.exports = require('./infra/pm2/ecosystem.config.js');
