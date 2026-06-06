const express = require("express");
const path = require("path");
const supabase = require("./supabaseClient");
const os = require("os");

const app = express();
app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;

// ─── State ─────────────────────────────────────────────────────────────────
let requestCount = 0;
let requestHistory = [];
let currentTraffic = 0;
let peakTraffic = { value: 0, time: null };
let requestLogs = [];        // last 50 request logs
let alerts = [];             // alert history

// IP control
const ipRequestMap = {};
const blockedIPs = new Set();
const whitelistedIPs = new Set(['::1', '127.0.0.1']);
const blacklistedIPs = new Set();
const DDOS_WINDOW_MS = 10000;
const DDOS_THRESHOLD = 50;
const BLOCK_DURATION_MS = 60000;

// CPU/Memory simulation state
let simCpu = 5;
let simMem = 30;

// ─── Helpers ───────────────────────────────────────────────────────────────
function addAlert(type, message) {
  alerts.unshift({ type, message, time: new Date().toISOString() });
  if (alerts.length > 50) alerts.pop();
}

function getActiveServers() {
  if (currentTraffic > 20) return 4;
  if (currentTraffic > 10) return 2;
  return 1;
}

// ─── Traffic decay ─────────────────────────────────────────────────────────
setInterval(() => {
  if (currentTraffic > 0) currentTraffic--;
  // Simulate CPU/Memory drifting with traffic
  simCpu = Math.min(95, Math.max(5, Math.round(currentTraffic * 3.5 + Math.random() * 8)));
  simMem = Math.min(90, Math.max(20, Math.round(30 + currentTraffic * 2 + Math.random() * 5)));
}, 3000);

// ─── IP cleanup ────────────────────────────────────────────────────────────
setInterval(() => {
  const now = Date.now();
  for (const ip in ipRequestMap) {
    ipRequestMap[ip] = ipRequestMap[ip].filter(t => now - t < DDOS_WINDOW_MS);
    if (ipRequestMap[ip].length === 0) delete ipRequestMap[ip];
  }
}, 30000);

// ─── DDoS / IP middleware ──────────────────────────────────────────────────
app.use((req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();

  // Skip static assets from logging
  const isAsset = req.path.match(/\.(css|js|png|ico|html)$/);

  // Blacklist check
  if (blacklistedIPs.has(ip)) {
    return res.status(403).json({ error: "IP blacklisted by administrator" });
  }

  // DDoS block check (skip whitelisted)
  if (!whitelistedIPs.has(ip)) {
    if (blockedIPs.has(ip)) {
      return res.status(429).json({ error: "IP temporarily blocked due to suspicious activity" });
    }
    if (!ipRequestMap[ip]) ipRequestMap[ip] = [];
    ipRequestMap[ip] = ipRequestMap[ip].filter(t => now - t < DDOS_WINDOW_MS);
    ipRequestMap[ip].push(now);

    if (ipRequestMap[ip].length > DDOS_THRESHOLD) {
      blockedIPs.add(ip);
      setTimeout(() => blockedIPs.delete(ip), BLOCK_DURATION_MS);
      addAlert('danger', `DDoS detected from IP ${ip} — blocked for 60s`);
    }
  }

  // Track traffic & log (skip assets)
  if (!isAsset) {
    requestCount++;
    currentTraffic++;
    requestHistory.push(currentTraffic);
    if (requestHistory.length > 30) requestHistory.shift();

    // Peak tracking
    if (currentTraffic > peakTraffic.value) {
      peakTraffic = { value: currentTraffic, time: new Date().toISOString() };
    }

    // Request log entry
    requestLogs.unshift({
      id: requestCount,
      time: new Date().toLocaleTimeString(),
      method: req.method,
      path: req.path,
      ip: ip.replace('::ffff:', ''),
      status: 200
    });
    if (requestLogs.length > 50) requestLogs.pop();

    // Traffic alerts
    const servers = getActiveServers();
    if (currentTraffic === 11) addAlert('warning', 'Medium traffic detected — scaling to 2 servers');
    if (currentTraffic === 21) addAlert('danger',  'High traffic detected — scaling to 4 servers');
    if (simCpu > 85)           addAlert('danger',  `CPU critical: ${simCpu}%`);
  }

  next();
});

// ─── Pages ─────────────────────────────────────────────────────────────────
app.get('/',            (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/login',       (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/analytics',   (req, res) => res.sendFile(path.join(__dirname, 'public', 'analytics.html')));
app.get('/security',    (req, res) => res.sendFile(path.join(__dirname, 'public', 'security.html')));
app.get('/logs',        (req, res) => res.sendFile(path.join(__dirname, 'public', 'logs.html')));

// ─── User API ──────────────────────────────────────────────────────────────
app.get('/users', async (req, res) => {
  const { data, error } = await supabase.from('users').select('*');
  if (error) return res.status(500).json(error);
  res.json(data);
});

app.post('/add-user', async (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Name and email required' });
  const { data, error } = await supabase.from('users').insert([{ name, email }]);
  if (error) return res.status(500).json(error);
  res.json(data);
});

app.delete('/delete-user/:id', async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from('users').delete().eq('id', id);
  if (error) return res.status(500).json(error);
  res.json({ message: 'User deleted' });
});

// ─── Monitor API ───────────────────────────────────────────────────────────
app.get('/monitor', (req, res) => {
  const activeServers = getActiveServers();
  let scalingStatus, health, scalingTier;
  if (activeServers === 4)      { scalingStatus = 'High Traffic';   health = 'Critical'; scalingTier = 3; }
  else if (activeServers === 2) { scalingStatus = 'Medium Traffic'; health = 'Moderate'; scalingTier = 2; }
  else                          { scalingStatus = 'Low Traffic';    health = 'Healthy';  scalingTier = 1; }

  const costPerServerPerHour = 0.0416;
  const suspiciousIPs = Object.entries(ipRequestMap).filter(([,t]) => t.length > 20).map(([ip]) => ip);

  res.json({
    status: 'Server Running',
    totalRequests: requestCount,
    currentTraffic,
    uptime: Math.floor(process.uptime()),
    traffic: scalingStatus,
    activeServers,
    health,
    scalingTier,
    history: requestHistory,
    peak: peakTraffic,
    cpu: simCpu,
    memory: simMem,
    ddos: {
      detected: suspiciousIPs.length > 0 || blockedIPs.size > 0,
      blockedIPs: blockedIPs.size,
      suspiciousIPs: suspiciousIPs.length,
    },
    cost: {
      perHour: (activeServers * costPerServerPerHour).toFixed(4),
      perDay:  (activeServers * costPerServerPerHour * 24).toFixed(2),
      currency: 'USD',
      tip: activeServers === 1 ? 'Optimal — running minimum servers'
         : activeServers === 2 ? 'Consider caching to reduce server count'
         : 'High cost — check for traffic spikes or DDoS'
    }
  });
});

// ─── Logs API ──────────────────────────────────────────────────────────────
app.get('/api/logs', (req, res) => {
  res.json({ logs: requestLogs, total: requestCount });
});

app.get('/api/alerts', (req, res) => {
  res.json({ alerts });
});

app.delete('/api/alerts', (req, res) => {
  alerts = [];
  res.json({ ok: true });
});

// ─── Security API ──────────────────────────────────────────────────────────
app.get('/api/security', (req, res) => {
  res.json({
    blocked:     [...blockedIPs],
    blacklisted: [...blacklistedIPs],
    whitelisted: [...whitelistedIPs],
    suspicious:  Object.entries(ipRequestMap)
                   .filter(([,t]) => t.length > 5)
                   .map(([ip, times]) => ({ ip, reqCount: times.length }))
                   .sort((a,b) => b.reqCount - a.reqCount)
                   .slice(0, 20)
  });
});

app.post('/api/security/blacklist', (req, res) => {
  const { ip } = req.body;
  if (!ip) return res.status(400).json({ error: 'IP required' });
  blacklistedIPs.add(ip);
  whitelistedIPs.delete(ip);
  addAlert('warning', `IP ${ip} manually blacklisted`);
  res.json({ ok: true });
});

app.delete('/api/security/blacklist/:ip', (req, res) => {
  blacklistedIPs.delete(decodeURIComponent(req.params.ip));
  res.json({ ok: true });
});

app.post('/api/security/whitelist', (req, res) => {
  const { ip } = req.body;
  if (!ip) return res.status(400).json({ error: 'IP required' });
  whitelistedIPs.add(ip);
  blacklistedIPs.delete(ip);
  blockedIPs.delete(ip);
  addAlert('info', `IP ${ip} whitelisted`);
  res.json({ ok: true });
});

app.delete('/api/security/whitelist/:ip', (req, res) => {
  const ip = decodeURIComponent(req.params.ip);
  if (ip !== '127.0.0.1' && ip !== '::1') whitelistedIPs.delete(ip);
  res.json({ ok: true });
});

app.post('/api/security/unblock/:ip', (req, res) => {
  blockedIPs.delete(decodeURIComponent(req.params.ip));
  res.json({ ok: true });
});

// ─── Analytics API ─────────────────────────────────────────────────────────
app.get('/api/analytics', (req, res) => {
  res.json({
    totalRequests: requestCount,
    peakTraffic,
    currentTraffic,
    history: requestHistory,
    cpu: simCpu,
    memory: simMem,
    uptime: Math.floor(process.uptime()),
    activeServers: getActiveServers()
  });
});

// ─── Export CSV ────────────────────────────────────────────────────────────
app.get('/api/export/logs', (req, res) => {
  const csv = ['ID,Time,Method,Path,IP,Status',
    ...requestLogs.map(l => `${l.id},${l.time},${l.method},${l.path},${l.ip},${l.status}`)
  ].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="request_logs.csv"');
  res.send(csv);
});

app.get('/api/export/traffic', (req, res) => {
  const csv = ['Sample,Traffic\n',
    ...requestHistory.map((v,i) => `${i+1},${v}`)
  ].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="traffic_history.csv"');
  res.send(csv);
});

// ─── Start ─────────────────────────────────────────────────────────────────
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
