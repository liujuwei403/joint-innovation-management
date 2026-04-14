const http = require('http');
const https = require('https');
const crypto = require('crypto');

const SSO_APP_ID = process.env.SSO_APP_ID;
const SSO_APP_KEY = process.env.SSO_APP_KEY;
const JWT_SECRET = process.env.JWT_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL;

// ticket 内存缓存（有效期2小时，提前5分钟刷新）
let ticketCache = { value: null, expireAt: 0 };

async function getTicket() {
  if (ticketCache.value && Date.now() < ticketCache.expireAt) {
    return ticketCache.value;
  }
  const result = await httpGet(
    `https://sso.100tal.com/basic/get_ticket?appid=${encodeURIComponent(SSO_APP_ID)}&appkey=${encodeURIComponent(SSO_APP_KEY)}`
  );
  if (result.errcode !== 0) throw new Error(`get_ticket failed: ${result.errmsg}`);
  ticketCache = {
    value: result.ticket,
    expireAt: Date.now() + 115 * 60 * 1000  // 1小时55分后过期，提前5分钟刷新
  };
  return result.ticket;
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function signJWT(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({
    ...payload,
    exp: Math.floor(Date.now() / 1000) + 7200
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', FRONTEND_URL || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  // SSO 回调：GET /auth/callback?token=xxx
  if (url.pathname === '/auth/callback' && req.method === 'GET') {
    const token = url.searchParams.get('token');
    if (!token) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'missing token' }));
      return;
    }
    try {
      const ticket = await getTicket();
      const result = await httpGet(
        `https://sso.100tal.com/api/v1/sso/verify?token=${encodeURIComponent(token)}&ticket=${encodeURIComponent(ticket)}`
      );
      if (result.errcode !== 0) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: result.errmsg }));
        return;
      }
      const jwt = signJWT({
        account_id: result.data.account_id,
        name: result.data.name,
        workcode: result.data.workcode,
        email: result.data.email,
      });
      res.writeHead(200);
      res.end(JSON.stringify({ token: jwt, user: result.data }));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // 健康检查
  if (url.pathname === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(9000, () => {
  console.log('SSO backend running on port 9000');
});
