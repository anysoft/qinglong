'use strict';
const http = require('node:http');
const req = http.get({ hostname: '127.0.0.1', port: Number(process.env.BACK_PORT || 5700), path: '/api/health', timeout: 4000 }, res => {
  let data = ''; res.on('data', b => { data += b; if (data.length > 16384) req.destroy(); });
  res.on('end', () => { try { process.exitCode = res.statusCode === 200 && JSON.parse(data).data?.status === 'ok' ? 0 : 1; } catch { process.exitCode = 1; } });
});
req.on('timeout', () => req.destroy()); req.on('error', () => { process.exitCode = 1; });
