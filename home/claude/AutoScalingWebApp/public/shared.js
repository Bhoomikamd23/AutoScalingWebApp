// ── shared.js — runs on every page ──────────────────────────────────────
const SUPABASE_URL = 'https://ebexokvdkzxqrvqudisw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImViZXhva3Zka3p4cXJ2cXVkaXN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNDEyNjUsImV4cCI6MjA5MzgxNzI2NX0.nULuy6nFlzFpvzw8aMEN28ccJ1XJSg07Ezwc_YZKQ1w';
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

async function initAuth() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { window.location.href = '/login'; return false; }
  const user = session.user;
  const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
  const avatarEl = document.getElementById('userAvatar');
  const nameEl   = document.getElementById('userName');
  if (avatarEl) avatarEl.textContent = name.charAt(0).toUpperCase();
  if (nameEl)   nameEl.textContent   = name;
  return true;
}

async function handleLogout() {
  await sb.auth.signOut();
  window.location.href = '/login';
}

function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  const btn = document.getElementById('themeBtn');
  if (btn) btn.textContent = saved === 'dark' ? '☀️' : '🌙';
}

function toggleTheme() {
  const html = document.documentElement;
  const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  const btn = document.getElementById('themeBtn');
  if (btn) btn.textContent = next === 'dark' ? '☀️' : '🌙';
}

function updateClock() {
  const el = document.getElementById('clock');
  if (el) el.textContent = new Date().toLocaleTimeString();
}

let notifTimer = null;
function showNotification(msg) {
  const el = document.getElementById('notification');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(notifTimer);
  notifTimer = setTimeout(() => el.classList.remove('show'), 3500);
}

// Mark the active nav link
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.nav-item').forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === window.location.pathname);
  });
});
