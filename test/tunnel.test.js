const localtunnel = require('localtunnel');

(async () => {
  try {
    console.log('Opening localtunnel...');
    const tunnel = await localtunnel({ port: 3000 });
    console.log('PUBLIC_TUNNEL_URL:', tunnel.url);
    tunnel.close();
    process.exit(0);
  } catch (err) {
    console.error('Tunnel error:', err);
    process.exit(1);
  }
})();
