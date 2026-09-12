const https = require('https');
const fs = require('fs');
const path = require('path');

const LIVE_URL = process.env.LIVE_URL || 'https://online-go.onrender.com';
const ADMIN_KEY = process.env.ADMIN_SECRET_KEY || 'admin_go_secret_2026';
const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');

async function syncLiveDb() {
  console.log('[Sync] Connecting to ' + LIVE_URL + ' to fetch live users...');
  
  return new Promise((resolve) => {
    const url = new URL(LIVE_URL + '/api/admin/export-db');
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'x-admin-key': ADMIN_KEY,
        'User-Agent': 'SyncLiveDB/1.0'
      },
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json && json.success && json.users) {
            const liveUsers = json.users;
            const liveCount = Object.keys(liveUsers).length;
            console.log('[Sync] Retrieved ' + liveCount + ' users from live server.');

            let localUsers = {};
            if (fs.existsSync(USERS_FILE)) {
              try {
                localUsers = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
              } catch (e) {}
            }

            const merged = Object.assign({}, localUsers, liveUsers);
            const totalCount = Object.keys(merged).length;

            fs.writeFileSync(USERS_FILE, JSON.stringify(merged, null, 2), 'utf-8');
            console.log('[Sync] Successfully saved ' + totalCount + ' users into ' + USERS_FILE);
            resolve(true);
          } else {
            console.log('[Sync] No users returned or invalid response:', data.slice(0, 100));
            resolve(false);
          }
        } catch (err) {
          console.error('[Sync] Failed to parse JSON response:', err.message);
          resolve(false);
        }
      });
    });

    req.on('error', (err) => {
      console.warn('[Sync] Could not reach live server (may be sleeping or offline):', err.message);
      resolve(false);
    });

    req.on('timeout', () => {
      console.warn('[Sync] Request timed out.');
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

if (require.main === module) {
  syncLiveDb();
}

module.exports = syncLiveDb;
