// ── Chart setup ──────────────────────────────────────────────────────────
const ctx = document.getElementById('trafficChart').getContext('2d');
const trafficChart = new Chart(ctx, {
  type: 'line',
  data: {
    labels: [],
    datasets: [{
      label: 'Traffic', data: [],
      borderColor: '#00c6ff', backgroundColor: 'rgba(0,198,255,0.08)',
      borderWidth: 2, tension: 0.4, fill: true,
      pointBackgroundColor: '#00c6ff', pointRadius: 3
    }]
  },
  options: {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color:'#4e6080', maxTicksLimit:8 }, grid: { color:'rgba(255,255,255,0.04)' } },
      y: { ticks: { color:'#4e6080' }, grid: { color:'rgba(255,255,255,0.04)' }, beginAtZero: true }
    }
  }
});

function clearChart() {
  trafficChart.data.labels = [];
  trafficChart.data.datasets[0].data = [];
  trafficChart.update();
  showNotification('📊 Chart cleared');
}

// ── Gauges ───────────────────────────────────────────────────────────────
const C = 2 * Math.PI * 40; // circumference ~251

function setGauge(arcId, pct) {
  const arc = document.getElementById(arcId);
  if (!arc) return;
  arc.setAttribute('stroke-dasharray', `${(pct/100)*C} ${C}`);
}

// ── Server rack ──────────────────────────────────────────────────────────
let lastServerCount = 0;

function renderServers(count) {
  if (count === lastServerCount) return;
  lastServerCount = count;

  const rack = document.getElementById('serverRack');
  rack.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const unit = document.createElement('div');
    unit.className = 'server-unit';
    unit.style.animationDelay = `${i * 0.12}s`;
    unit.innerHTML = `
      <div class="server-box"><span style="font-size:22px">🖥️</span><div class="server-led"></div></div>
      <div class="server-label">srv-${String(i+1).padStart(2,'0')}</div>`;
    rack.appendChild(unit);
  }
  document.getElementById('serverCount').textContent = count;
  document.getElementById('scalingTierBadge').textContent = `Tier ${count<=1?1:count<=2?2:3}`;

  // Load balancer visual
  const lb    = document.getElementById('lbVisual');
  const lines = document.getElementById('lbLines');
  if (count > 1) {
    lb.style.display = 'block';
    lines.innerHTML = Array.from({length:count}, (_,i) =>
      `<div style="display:inline-flex;flex-direction:column;align-items:center;gap:4px;margin:0 8px">
        <div style="font-size:18px;animation:bounce ${0.7+i*.2}s ease-in-out infinite alternate">↓</div>
        <div style="font-size:11px;font-family:JetBrains Mono,monospace;color:var(--muted)">srv-0${i+1}</div>
      </div>`).join('');
  } else {
    lb.style.display = 'none';
  }
}

// ── Monitor ───────────────────────────────────────────────────────────────
async function loadMonitor() {
  let data;
  try { const r = await fetch('/monitor'); data = await r.json(); } catch { return; }

  // Metric cards
  document.getElementById('requests').textContent = data.totalRequests.toLocaleString();

  const tEl = document.getElementById('traffic');
  tEl.textContent = data.traffic; tEl.className = 'metric-value';
  const trafficMap = { 'Low Traffic':['low','All systems normal'], 'Medium Traffic':['medium','Scaling to 2 servers'], 'High Traffic':['high','Scaling to max capacity'] };
  const [cls, sub] = trafficMap[data.traffic] || ['low',''];
  tEl.classList.add(cls);
  document.getElementById('trafficSub').textContent = sub;
  if (data.traffic === 'Medium Traffic') showNotification('⚠️ Medium Traffic — scaling up');
  if (data.traffic === 'High Traffic')   showNotification('🚨 High Traffic — max scaling!');

  const hEl = document.getElementById('health');
  hEl.textContent = data.health; hEl.className = 'metric-value';
  const healthMap = { 'Healthy':['low','All checks passing'], 'Moderate':['medium','Slight load detected'], 'Critical':['high','High load — monitoring'] };
  const [hCls, hSub] = healthMap[data.health] || ['low',''];
  hEl.classList.add(hCls);
  document.getElementById('healthSub').textContent = hSub;

  // Uptime
  const upMins = Math.floor(data.uptime / 60);
  document.getElementById('uptimeBadge').textContent = `⬤ Online · ${upMins}m`;

  // Gauges
  setGauge('cpuArc', data.cpu);
  setGauge('memArc', data.memory);
  document.getElementById('cpuVal').textContent = data.cpu;
  document.getElementById('memVal').textContent = data.memory;

  // Peak / uptime stats
  document.getElementById('peakVal').textContent   = data.peak?.value ? `${data.peak.value} req` : '0 req';
  document.getElementById('peakTime').textContent  = data.peak?.time  ? new Date(data.peak.time).toLocaleTimeString() : '—';
  document.getElementById('peakBadge').textContent = `Peak: ${data.peak?.value ?? 0} req`;
  document.getElementById('uptimeVal').textContent = upMins + 'm';
  document.getElementById('costSmall').textContent = `$${data.cost.perHour}`;

  // Servers
  renderServers(data.activeServers);

  // Traffic bar
  const pct = Math.min(100, Math.round((data.currentTraffic / 25) * 100));
  document.getElementById('scalingBar').style.width = pct + '%';
  document.getElementById('trafficPct').textContent = pct + '%';

  // Chart
  const label = new Date().toLocaleTimeString();
  trafficChart.data.labels.push(label);
  trafficChart.data.datasets[0].data.push(data.currentTraffic);
  if (trafficChart.data.labels.length > 20) { trafficChart.data.labels.shift(); trafficChart.data.datasets[0].data.shift(); }
  trafficChart.update('quiet');

  // DDoS
  const ddos = data.ddos;
  document.getElementById('blockedIPs').textContent    = ddos.blockedIPs;
  document.getElementById('suspiciousIPs').textContent = ddos.suspiciousIPs;
  document.getElementById('ddosStatus').textContent    = ddos.detected ? 'ALERT' : 'Safe';
  const ddosDot = document.getElementById('ddosDot');
  const ddosAlert = document.getElementById('ddosAlert');
  if (ddos.detected) {
    ddosDot.classList.add('danger');
    ddosAlert.classList.remove('hidden');
    showNotification('🚨 DDoS Activity Detected!');
  } else {
    ddosDot.classList.remove('danger');
    ddosAlert.classList.add('hidden');
  }

  // Cost
  document.getElementById('costPerHour').textContent = `$${data.cost.perHour}`;
  document.getElementById('costPerDay').textContent  = `$${data.cost.perDay}`;
  const costTipEl = document.getElementById('costTip');
  costTipEl.textContent = data.cost.tip;
  costTipEl.className = 'cost-tip';
  if (data.activeServers === 2) costTipEl.classList.add('warn');
  if (data.activeServers >= 3) costTipEl.classList.add('danger');
  const eff = Math.round((1 / data.activeServers) * 100);
  document.getElementById('costBar').style.width = eff + '%';
  document.getElementById('costEff').textContent = eff + '%';
}

// ── Users ─────────────────────────────────────────────────────────────────
let allUsers = [];

async function loadUsers() {
  try {
    const res = await fetch('/users');
    allUsers = await res.json();
    displayUsers(allUsers);
    document.getElementById('userCountBadge').textContent = `${allUsers.length} user${allUsers.length!==1?'s':''}`;
  } catch { showNotification('❌ Failed to load users'); }
}

function displayUsers(users) {
  const list = document.getElementById('userList');
  list.innerHTML = '';
  if (!users.length) { list.innerHTML = '<div class="empty-state">No users yet. Add one above ↑</div>'; return; }
  users.forEach(user => {
    const card = document.createElement('div');
    card.className = 'user-card';
    const initials = user.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
    card.innerHTML = `
      <div class="user-card-avatar">${initials}</div>
      <h3>${user.name}</h3>
      <p>${user.email}</p>
      <button class="delete-btn" onclick="deleteUser(${user.id})">🗑 Delete</button>`;
    list.appendChild(card);
  });
}

function filterUsers() {
  const q = document.getElementById('search').value.toLowerCase();
  displayUsers(allUsers.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)));
}

async function addUser() {
  const name  = document.getElementById('name').value.trim();
  const email = document.getElementById('email').value.trim();
  if (!name || !email) { showNotification('⚠️ Please enter both name and email'); return; }
  try {
    const res = await fetch('/add-user', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name,email}) });
    if (!res.ok) throw new Error();
    document.getElementById('name').value = '';
    document.getElementById('email').value = '';
    showNotification('✅ User added successfully');
    loadUsers();
  } catch { showNotification('❌ Failed to add user'); }
}

async function deleteUser(id) {
  try {
    await fetch(`/delete-user/${id}`, { method:'DELETE' });
    showNotification('🗑 User deleted');
    loadUsers();
  } catch { showNotification('❌ Failed to delete user'); }
}

document.getElementById('email').addEventListener('keydown', e => { if (e.key==='Enter') addUser(); });

// Bounce animation for LB arrows
const style = document.createElement('style');
style.textContent = '@keyframes bounce{from{transform:translateY(0)}to{transform:translateY(8px)}}';
document.head.appendChild(style);

// ── Bootstrap ─────────────────────────────────────────────────────────────
(async () => {
  const authed = await initAuth(); if (!authed) return;
  initTheme(); updateClock(); loadUsers(); loadMonitor();
  setInterval(updateClock, 1000);
  setInterval(loadMonitor, 3000);
  setInterval(loadUsers,  15000);
})();
