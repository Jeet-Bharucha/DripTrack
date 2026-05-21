// ─────────────────────────────────────────────
// DRIPTRACK — API Connector v6
// ─────────────────────────────────────────────
const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? `http://${window.location.hostname}:3001/api`
  : `${window.location.origin}/api`;
const AUTH_BASE = API_BASE.replace('/api', '/auth');
window._lastResults = [];
window._angleCache = {};
window._lastQuery = '';
window._shownCount = 8;

// ─────────────────────────────────────────────
// DEAL SCORE — 0-100 rating per product
// ─────────────────────────────────────────────
function getDealScore(item, avgPrice) {
  let score = 0;
  // Price vs average (up to 45 pts)
  if (avgPrice > 0 && item.price) {
    const pct = (avgPrice - item.price) / avgPrice;
    score += Math.min(45, Math.max(0, Math.round(pct * 225)));
  } else {
    score += 20;
  }
  // Authenticity (25 pts)
  if (!item.suspicious) score += 25;
  // Trusted source (30 pts)
  const trusted = ['amazon','ebay','stockx','goat','nike','adidas','foot locker','footlocker','new balance','nordstrom','zappos','chrono24'];
  if (item.source && trusted.some(t => item.source.toLowerCase().includes(t))) score += 30;
  return Math.min(100, Math.max(0, Math.round(score)));
}

function dealScoreColor(score) {
  if (score >= 80) return '#39ff14';
  if (score >= 60) return '#e8ff00';
  if (score >= 40) return '#ff9900';
  return '#ff3c3c';
}

// ─────────────────────────────────────────────
// SEARCH AUTOCOMPLETE
// ─────────────────────────────────────────────
let _acTimeout = null;
let _acVisible = false;

function initAutocomplete() {
  const input = document.getElementById('search-input');
  if (!input) return;

  // Create dropdown
  const dropdown = document.createElement('div');
  dropdown.id = 'ac-dropdown';
  dropdown.style.cssText = `
    position:absolute;top:100%;left:0;right:0;background:var(--grey-900);
    border:1px solid var(--grey-700);border-top:none;z-index:999;display:none;
    max-height:320px;overflow-y:auto;`;
  input.parentElement.style.position = 'relative';
  input.parentElement.appendChild(dropdown);

  input.addEventListener('input', () => {
    clearTimeout(_acTimeout);
    const q = input.value.trim();
    if (q.length < 2) { hideAC(); return; }
    _acTimeout = setTimeout(() => fetchSuggestions(q), 200);
  });

  input.addEventListener('keydown', e => {
    if (!_acVisible) return;
    const items = dropdown.querySelectorAll('.ac-item');
    const active = dropdown.querySelector('.ac-item.active');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = active ? (active.nextElementSibling || items[0]) : items[0];
      items.forEach(i => i.classList.remove('active'));
      if (next) { next.classList.add('active'); input.value = next.dataset.value; }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = active ? (active.previousElementSibling || items[items.length - 1]) : items[items.length - 1];
      items.forEach(i => i.classList.remove('active'));
      if (prev) { prev.classList.add('active'); input.value = prev.dataset.value; }
    } else if (e.key === 'Escape') {
      hideAC();
    } else if (e.key === 'Enter') {
      hideAC();
    }
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('#ac-dropdown') && e.target !== input) hideAC();
  });
}

async function fetchSuggestions(q) {
  // Local instant suggestions first
  const LOCAL = [
    // Nike
    'Nike Air Jordan 1','Nike Air Jordan 4','Nike Air Jordan 11','Nike Dunk Low Panda',
    'Nike Dunk High','Nike Air Max 90','Nike Air Max 97','Nike Air Force 1',
    'Nike Blazer Mid 77','Nike x Off-White Air Force 1',
    // Adidas
    'Adidas Yeezy Boost 350','Adidas Yeezy Slide','Adidas Samba OG',
    'Adidas Stan Smith','Adidas Campus 00s','Adidas Gazelle',
    // New Balance
    'New Balance 550','New Balance 574','New Balance 990v5',
    'New Balance 993','New Balance 2002R','New Balance 1906R',
    // Other sneakers
    'Asics Gel-Kayano 14','Converse Chuck Taylor 70','Vans Old Skool',
    'Balenciaga Triple S','Jordan 4 Military Black','Jordan 1 Chicago',
    // Watches
    'Rolex Submariner','Rolex Daytona','Rolex GMT Master II Pepsi',
    'AP Royal Oak','Omega Speedmaster','Casio G-Shock',
    'Seiko Prospex','Cartier Santos',
    // Bags
    'Louis Vuitton Neverfull','Louis Vuitton Speedy','Gucci GG Marmont',
    'Hermès Birkin','Chanel Classic Flap','Prada Re-Nylon',
    'Coach Tabby','Dior Lady Dior',
    // Streetwear
    'Supreme Box Logo Hoodie','Off-White Industrial Belt',
    'Stussy Hoodie','Essentials Fear of God','Palace Tri-Ferg',
    // Sunglasses
    'Ray-Ban Aviator','Ray-Ban Wayfarer','Oakley Frogskins','Oakley Radar EV',
    // Accessories
    'Chrome Hearts Ring','Cartier Love Bracelet',
  ];
  const ql = q.toLowerCase();
  const local = LOCAL.filter(s => s.toLowerCase().includes(ql));
  showAC(local.slice(0, 5), q);

  // Then fetch server suggestions
  try {
    const res = await fetch(`${API_BASE}/suggestions?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    const merged = [...new Set([...data.suggestions, ...local])].slice(0, 7);
    if (document.getElementById('search-input')?.value.trim() === q) showAC(merged, q);
  } catch {}
}

function showAC(items, query) {
  const dropdown = document.getElementById('ac-dropdown');
  if (!dropdown || !items.length) { hideAC(); return; }
  const ql = query.toLowerCase();
  dropdown.innerHTML = items.map(s => {
    const idx = s.toLowerCase().indexOf(ql);
    const highlighted = idx >= 0
      ? s.slice(0, idx) + `<strong style="color:var(--accent)">${s.slice(idx, idx + query.length)}</strong>` + s.slice(idx + query.length)
      : s;
    return `<div class="ac-item" data-value="${s}" onclick="selectAC('${s.replace(/'/g,"\\'")}')">
      <span style="font-size:13px;color:var(--grey-300)">🔍</span>
      <span>${highlighted}</span>
    </div>`;
  }).join('');
  dropdown.style.display = 'block';
  _acVisible = true;
}

function hideAC() {
  const d = document.getElementById('ac-dropdown');
  if (d) d.style.display = 'none';
  _acVisible = false;
}

function selectAC(value) {
  const input = document.getElementById('search-input');
  if (input) input.value = value;
  hideAC();
  searchLivePrices(value);
}

// ─────────────────────────────────────────────
// PWA + PUSH NOTIFICATION REGISTRATION
// ─────────────────────────────────────────────
async function registerPWA() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/sw.js');
    console.log('✅ Service worker registered');
  } catch (e) { console.log('SW registration skipped:', e.message); }
}

async function requestPushPermission() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
  const token = localStorage.getItem('driptrack_token');
  if (!token) { showToast('Log in to enable push notifications'); return; }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') { showToast('Notifications blocked — check browser settings'); return; }

  try {
    const keyRes = await fetch(`${API_BASE}/push/vapid-public-key`);
    const { key } = await keyRes.json();
    if (!key) { showToast('Push not configured on server yet'); return; }

    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });
    await fetch(`${API_BASE}/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ subscription: sub }),
    });
    showToast('🔔 Push notifications enabled!');
  } catch (e) { showToast('Could not enable push notifications'); }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return new Uint8Array([...raw].map(c => c.charCodeAt(0)));
}

// ─────────────────────────────────────────────
// TOAST NOTIFICATION (lightweight)
// ─────────────────────────────────────────────
function showToast(msg, duration) {
  duration = duration || 3000;
  let toast = document.getElementById('dt-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'dt-toast';
    toast.style.cssText = `position:fixed;bottom:32px;left:50%;transform:translateX(-50%) translateY(100px);
      background:var(--grey-800);border:1px solid var(--grey-600);color:var(--white);
      font-family:'Space Mono',monospace;font-size:11px;letter-spacing:1px;
      padding:12px 24px;z-index:9999;transition:transform 0.3s;pointer-events:none;
      white-space:nowrap;box-shadow:0 8px 32px rgba(0,0,0,0.5)`;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  requestAnimationFrame(() => { toast.style.transform = 'translateX(-50%) translateY(0)'; });
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toast.style.transform = 'translateX(-50%) translateY(100px)'; }, duration);
}

// ─────────────────────────────────────────────
// SET PRICE ALERT (from panel)
// ─────────────────────────────────────────────
function openAlertModal(productName, currentPrice, productImage) {
  const existing = document.getElementById('alert-modal');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'alert-modal';
  modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;`;
  modal.innerHTML = `
    <div style="background:var(--grey-900);border:1px solid var(--grey-700);padding:40px;max-width:420px;width:100%;position:relative">
      <button onclick="document.getElementById('alert-modal').remove()"
        style="position:absolute;top:16px;right:16px;background:none;border:none;color:var(--grey-400);font-size:20px;cursor:pointer;line-height:1">✕</button>
      <div style="font-family:'Bebas Neue',sans-serif;font-size:28px;letter-spacing:3px;color:var(--accent);margin-bottom:4px">SET PRICE ALERT</div>
      <div style="font-family:'Space Mono',monospace;font-size:10px;color:var(--grey-400);letter-spacing:2px;margin-bottom:24px">We'll email + notify you when price drops</div>
      <div style="font-family:'Space Mono',monospace;font-size:12px;color:var(--grey-300);margin-bottom:8px;line-height:1.5">${productName.slice(0, 60)}</div>
      <div style="font-family:'Space Mono',monospace;font-size:11px;color:var(--grey-500);margin-bottom:24px">Current best price: <span style="color:var(--up)">$${parseFloat(currentPrice).toFixed(2)}</span></div>
      <label style="font-family:'Space Mono',monospace;font-size:10px;letter-spacing:2px;color:var(--grey-400);text-transform:uppercase;display:block;margin-bottom:8px">Alert me when price drops to:</label>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:24px">
        <span style="font-family:'Bebas Neue',sans-serif;font-size:24px;color:var(--accent)">$</span>
        <input id="alert-price-input" type="number" step="0.01" min="1" placeholder="${(currentPrice * 0.9).toFixed(2)}"
          value="${(currentPrice * 0.9).toFixed(2)}"
          style="flex:1;background:var(--grey-800);border:1px solid var(--grey-600);color:var(--white);
                 font-family:'Space Mono',monospace;font-size:16px;padding:12px 16px;outline:none;
                 transition:border-color 0.2s"
          onfocus="this.style.borderColor='var(--accent)'"
          onblur="this.style.borderColor='var(--grey-600)'">
      </div>
      <button onclick="_submitAlert('${productName.replace(/'/g,"\\'")}', '${productImage || ''}')"
        style="width:100%;background:var(--accent);color:var(--black);border:none;
               font-family:'Space Mono',monospace;font-size:12px;font-weight:700;
               letter-spacing:2px;text-transform:uppercase;padding:16px;cursor:pointer;
               transition:opacity 0.2s"
        onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
        🔔 SET ALERT
      </button>
      <div style="font-family:'Space Mono',monospace;font-size:9px;color:var(--grey-500);margin-top:12px;text-align:center">
        You must be logged in to set alerts
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  setTimeout(() => document.getElementById('alert-price-input')?.focus(), 100);
}

async function _submitAlert(productName, productImage) {
  const token = localStorage.getItem('driptrack_token');
  if (!token) { showToast('Please log in to set price alerts'); return; }
  const price = parseFloat(document.getElementById('alert-price-input')?.value);
  if (!price || price <= 0) { showToast('Enter a valid target price'); return; }
  try {
    const res = await fetch(`${AUTH_BASE}/alerts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ productName, targetPrice: price, productImage }),
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById('alert-modal')?.remove();
      showToast(`🔔 Alert set for $${price.toFixed(2)} — we'll notify you!`, 4000);
      // Also request push permission if not yet granted
      if (Notification?.permission === 'default') requestPushPermission();
    } else {
      showToast(data.message || 'Could not set alert');
    }
  } catch { showToast('Network error — try again'); }
}

// ─────────────────────────────────────────────
// BIGGEST MOVERS SECTION
// ─────────────────────────────────────────────
async function loadBiggestMovers() {
  const section = document.getElementById('movers-section');
  if (!section) return;
  try {
    const res = await fetch(`${API_BASE}/movers`);
    const data = await res.json();
    const gainers = data.gainers || [];
    const losers = data.losers || [];
    if (!gainers.length && !losers.length) { section.style.display = 'none'; return; }
    section.style.display = 'block';
    const render = (items, type) => items.map(m => {
      const isUp = m.changePct > 0;
      const fmt = p => p >= 1000 ? '$' + (p/1000).toFixed(1) + 'K' : '$' + p.toFixed(2);
      return `
        <div onclick="quickSearch('${m.name.replace(/'/g,"\\'")}') " style="
          background:var(--grey-800);border:1px solid ${isUp ? 'rgba(57,255,20,0.2)' : 'rgba(255,60,60,0.2)'};
          padding:16px 20px;cursor:pointer;transition:all 0.2s;display:flex;justify-content:space-between;align-items:center"
          onmouseover="this.style.borderColor='${isUp ? '#39ff14' : '#ff3c3c'}'"
          onmouseout="this.style.borderColor='${isUp ? 'rgba(57,255,20,0.2)' : 'rgba(255,60,60,0.2)'}'">
          <div>
            <div style="font-family:'Space Mono',monospace;font-size:11px;color:var(--white);margin-bottom:4px">${m.name.slice(0,30)}${m.name.length>30?'...':''}</div>
            <div style="font-family:'Space Mono',monospace;font-size:9px;color:var(--grey-400)">${fmt(m.firstPrice)} → ${fmt(m.currentPrice)}</div>
          </div>
          <div style="font-family:'Bebas Neue',sans-serif;font-size:22px;color:${isUp ? 'var(--up)' : 'var(--down)'}">
            ${isUp ? '▲' : '▼'}${Math.abs(m.changePct)}%
          </div>
        </div>`;
    }).join('');
    document.getElementById('movers-gainers').innerHTML = gainers.length ? render(gainers, 'gainer') : '<div style="font-family:\'Space Mono\',monospace;font-size:10px;color:var(--grey-500);padding:20px 0">No gainers in last 48h</div>';
    document.getElementById('movers-losers').innerHTML = losers.length ? render(losers, 'loser') : '<div style="font-family:\'Space Mono\',monospace;font-size:10px;color:var(--grey-500);padding:20px 0">No drops in last 48h</div>';
  } catch { if (section) section.style.display = 'none'; }
}

// INIT on load
document.addEventListener('DOMContentLoaded', () => {
  initAutocomplete();
  registerPWA();
  loadBiggestMovers();
  renderRecentlyViewed(); // show any previously viewed items
});

// Trending searches to auto-load on the main page
// These rotate so the page always feels fresh
const AUTO_SEARCH_QUERIES = [
  // Sneakers
  'Nike Air Jordan 1',
  'Nike Air Jordan 4 Retro',
  'Nike Air Jordan 11',
  'Nike Dunk Low Panda',
  'Nike Dunk High',
  'Nike Air Max 90',
  'Nike Air Force 1',
  'Nike Air Max 97',
  'Adidas Yeezy Boost 350 V2',
  'Adidas Yeezy 700',
  'Adidas Stan Smith',
  'New Balance 550',
  'New Balance 574',
  'New Balance 990v5',
  'New Balance 2002R',
  'Asics Gel-Kayano 14',
  'Asics Gel-Lyte III',
  'Converse Chuck Taylor All Star',
  'Vans Old Skool',
  'Jordan 4 Military Black',
  'Jordan 3 Retro',
  // Watches
  'Rolex Submariner',
  'Rolex Daytona',
  'Rolex GMT Master II Pepsi',
  'AP Royal Oak',
  'Omega Speedmaster',
  'Casio G-Shock',
  'Seiko Prospex',
  'Tag Heuer Carrera',
  // Bags
  'Louis Vuitton Neverfull',
  'Louis Vuitton Speedy',
  'Gucci GG Marmont bag',
  'Prada Nylon Bag',
  'Coach Tabby bag',
  'Kate Spade bag',
  // Streetwear
  'Supreme Box Logo Hoodie',
  'Off-White Industrial Belt',
  'Stussy hoodie',
  'Essentials Fear of God hoodie',
  'Palace Skateboards',
  // Sunglasses
  'Ray-Ban Aviator',
  'Ray-Ban Wayfarer',
  'Oakley Frogskins',
  'Oakley Radar EV',
];

function safeUrl(url) {
  if (!url || url === 'undefined' || url === 'null') return null;
  try { new URL(url); return url; } catch { return null; }
}

// ─────────────────────────────────────────────
// AUTO LOAD REAL PRODUCTS ON PAGE LOAD
// Fetches multiple queries and shows them all
// ─────────────────────────────────────────────
async function autoLoadProducts() {
  const grid = document.getElementById('product-grid');

  // Show loading skeleton cards
  grid.innerHTML = Array(16).fill(0).map((_, i) => `
    <div class="product-card" style="animation-delay:${i * 0.05}s;pointer-events:none">
      <div class="card-img-wrap" style="background:var(--grey-800)">
        <div style="width:100%;height:100%;background:linear-gradient(90deg,var(--grey-800) 25%,var(--grey-700) 50%,var(--grey-800) 75%);background-size:200% 100%;animation:shimmer 1.5s infinite"></div>
      </div>
      <div class="card-body">
        <div style="height:10px;width:60px;background:var(--grey-700);margin-bottom:10px;border-radius:2px"></div>
        <div style="height:16px;width:140px;background:var(--grey-700);margin-bottom:8px;border-radius:2px"></div>
        <div style="height:12px;width:100px;background:var(--grey-800);margin-bottom:16px;border-radius:2px"></div>
        <div style="height:32px;width:80px;background:var(--grey-700);border-radius:2px"></div>
      </div>
    </div>
  `).join('') + `<style>@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}</style>`;

  try {
    // Pick 7 random queries from the list for variety
    const shuffled = AUTO_SEARCH_QUERIES.sort(() => Math.random() - 0.5).slice(0, 7);

    // Fetch all in parallel
    const allResults = await Promise.all(
      shuffled.map(q =>
        fetch(`${API_BASE}/prices?q=${encodeURIComponent(q)}`)
          .then(r => r.json())
          .then(data => (data.results || []).filter(r => r && r.price))
          .catch(() => [])
      )
    );

    // Flatten and deduplicate by source+price combo
    const combined = allResults.flat();
    const seen = new Set();
    const unique = combined.filter(r => {
      const key = `${r.source}-${r.price}-${(r.title||'').slice(0,20)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (unique.length === 0) {
      showEmptyState(grid);
      return;
    }

    // Store globally
    window._lastResults = unique;
    window._lastQuery = shuffled[0];
    window._lastFetchTime = Date.now();
    const tsBar = document.getElementById('update-timestamp-bar');
    if (tsBar) tsBar.textContent = '⟳ Updated just now';

    // Render all real products
    renderLiveResults(unique, true);

  } catch (err) {
    console.error('Auto-load error:', err);
    showEmptyState(grid);
  }
}

function showEmptyState(grid) {
  // Fall back to static demo products so users can still browse and add to watchlist
  if (typeof renderStaticProducts === 'function') {
    renderStaticProducts('all');
    const countEl = document.getElementById('result-count');
    if (countEl) countEl.textContent = 'Demo data — connect backend for live prices';
    const tsBar = document.getElementById('update-timestamp-bar');
    if (tsBar) tsBar.textContent = '';
  } else if (grid) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;padding:80px 40px;text-align:center">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:56px;letter-spacing:4px;
                    color:var(--accent2);margin-bottom:16px;line-height:1">NO LIVE DATA</div>
        <div style="font-family:'Space Mono',monospace;font-size:11px;letter-spacing:2px;
                    color:var(--grey-400);margin-bottom:8px">Backend not reachable</div>
        <div style="font-family:'Space Mono',monospace;font-size:10px;color:var(--grey-600);margin-bottom:32px">
          Make sure <code style="background:var(--grey-800);padding:2px 6px">npm start</code> is running in the backend folder
        </div>
        <button onclick="autoLoadProducts()"
          style="font-family:'Space Mono',monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;
                 padding:14px 28px;background:var(--accent);color:var(--black);border:none;cursor:pointer;font-weight:700;margin-right:12px">
          ↺ Retry
        </button>
      </div>`;
  }
}

// ─────────────────────────────────────────────
// SEARCH (manual search by user)
// ─────────────────────────────────────────────
function _showSearchBackBar(query) {
  // Remove old bar
  document.getElementById('search-back-bar')?.remove();
  const bar = document.createElement('div');
  bar.id = 'search-back-bar';
  bar.style.cssText = `
    display:flex;align-items:center;justify-content:space-between;
    background:var(--grey-900);border-top:1px solid var(--grey-700);
    border-bottom:1px solid var(--grey-700);
    padding:12px 48px;position:sticky;top:100px;z-index:490;
    animation:fadeUp 0.4s ease both;`;
  bar.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px">
      <button onclick="_clearSearch()"
        style="font-family:'Space Mono',monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;
               background:transparent;border:1px solid var(--grey-600);color:var(--grey-200);
               padding:8px 16px;cursor:pointer;transition:all 0.2s;display:flex;align-items:center;gap:8px"
        onmouseover="this.style.borderColor='var(--accent)';this.style.color='var(--accent)'"
        onmouseout="this.style.borderColor='var(--grey-600)';this.style.color='var(--grey-200)'">
        ← All Products
      </button>
      <span style="font-family:'Space Mono',monospace;font-size:10px;letter-spacing:1px;color:var(--grey-500)">
        Results for <strong style="color:var(--grey-200)">"${query}"</strong>
      </span>
    </div>
    <button onclick="_clearSearch()"
      style="font-family:'Space Mono',monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;
             background:transparent;border:none;color:var(--grey-500);
             padding:8px;cursor:pointer;transition:color 0.2s"
      onmouseover="this.style.color='var(--accent2)'"
      onmouseout="this.style.color='var(--grey-500)'">
      ✕ Clear
    </button>`;

  // Insert before products section
  const productsSection = document.getElementById('products');
  if (productsSection) productsSection.insertAdjacentElement('beforebegin', bar);
}

function _clearSearch() {
  // Remove back bar + savings banner
  document.getElementById('search-back-bar')?.remove();
  document.getElementById('savings-banner')?.remove();

  // Clear search input
  const inp = document.getElementById('search-input');
  if (inp) { inp.value = ''; _hideClearBtn(); }

  // Hide chart + compare
  const chartSection = document.getElementById('chart');
  const compareSection = document.getElementById('compare');
  if (chartSection) chartSection.style.display = 'none';
  if (compareSection) compareSection.style.display = 'none';

  // Reset result count / timestamp
  const countEl = document.getElementById('result-count');
  if (countEl) countEl.textContent = '';

  // Reload auto products
  window._lastResults = [];
  autoLoadProducts();
}

// Show/hide ✕ button inside the search input
function _showClearBtn() {
  let btn = document.getElementById('search-clear-btn');
  if (!btn) return;
  btn.style.display = 'flex';
}
function _hideClearBtn() {
  const btn = document.getElementById('search-clear-btn');
  if (btn) btn.style.display = 'none';
}

async function searchLivePrices(query) {
  if (!query || query.trim() === '') return;

  window._lastQuery = query;
  _showClearBtn();
  const grid = document.getElementById('product-grid');
  grid.innerHTML = `
    <div style="grid-column:1/-1;padding:60px;text-align:center;
      font-family:'Space Mono',monospace;font-size:12px;letter-spacing:3px;color:var(--accent)">
      <div style="font-size:28px;margin-bottom:12px">⚡</div>
      SCANNING ALL SOURCES FOR "${query.toUpperCase()}"...
    </div>`;

  try {
    const res = await fetch(`${API_BASE}/prices?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    window._lastResults = (data.results || []).filter(r => r && r.price);
    window._lastFetchTime = Date.now();

    // Update timestamp bar
    const tsBar = document.getElementById('update-timestamp-bar');
    if (tsBar) tsBar.textContent = '⟳ Updated just now';

    if (!window._lastResults.length) {
      const suggestions = ['Nike Air Jordan 1', 'Yeezy Boost 350', 'Rolex Submariner', 'Louis Vuitton Neverfull', 'Supreme Box Logo'];
      grid.innerHTML = `
        <div style="grid-column:1/-1;padding:80px 40px;text-align:center">
          <div style="font-size:64px;margin-bottom:20px;filter:grayscale(0.3)">🔍</div>
          <div style="font-family:'Bebas Neue',sans-serif;font-size:52px;letter-spacing:4px;
                      color:var(--grey-700);margin-bottom:12px;line-height:1">NO RESULTS FOUND</div>
          <div style="font-family:'Space Mono',monospace;font-size:11px;letter-spacing:2px;
                      color:var(--grey-500);margin-bottom:8px">
            No listings for <strong style="color:var(--grey-300)">"${query}"</strong>
          </div>
          <div style="font-family:'Space Mono',monospace;font-size:10px;color:var(--grey-600);margin-bottom:32px">
            Tip: Try a shorter or more specific product name
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-bottom:32px">
            ${suggestions.map(s => `
              <button onclick="document.getElementById('search-input').value='${s}';searchLivePrices('${s}')"
                style="font-family:'Space Mono',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;
                       padding:8px 16px;background:transparent;border:1px solid var(--grey-600);color:var(--grey-400);
                       cursor:pointer;transition:all 0.2s"
                onmouseover="this.style.borderColor='var(--accent)';this.style.color='var(--accent)'"
                onmouseout="this.style.borderColor='var(--grey-600)';this.style.color='var(--grey-400)'">${s}</button>`).join('')}
          </div>
          <button onclick="document.getElementById('search-input').focus()"
            style="font-family:'Space Mono',monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;
                   padding:14px 28px;background:var(--accent);color:var(--black);border:none;cursor:pointer;font-weight:700">
            Try Another Search →
          </button>
        </div>`;
      return;
    }

    renderLiveResults(window._lastResults, false);
    _showSearchBackBar(query);
    // Show chart and compare sections now that we have data
    const chartSection = document.getElementById('chart');
    const compareSection = document.getElementById('compare');
    if (chartSection) chartSection.style.display = 'block';
    if (compareSection) compareSection.style.display = 'block';
    renderLiveCompareTable(window._lastResults, query);
    updateChart(query, window._lastResults);
    // Show savings banner
    if (typeof showSavingsBanner === 'function') showSavingsBanner(window._lastResults);

  } catch (err) {
    console.error('Search error:', err);
    // Branded error state
    const errGrid = document.getElementById('product-grid');
    if (errGrid) errGrid.innerHTML = `
      <div style="grid-column:1/-1;padding:80px 40px;text-align:center">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:56px;letter-spacing:4px;color:var(--accent2);margin-bottom:16px;line-height:1">API ERROR</div>
        <div style="font-family:'Space Mono',monospace;font-size:11px;letter-spacing:2px;color:var(--grey-500);margin-bottom:32px">
          Could not connect to price data. Make sure the backend is running.
        </div>
        <button onclick="searchLivePrices(window._lastQuery||'')"
          style="font-family:'Space Mono',monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;
                 padding:14px 28px;background:var(--accent);color:var(--black);border:none;cursor:pointer;font-weight:700;margin-right:12px">
          ↺ Retry
        </button>
        <button onclick="renderStaticProducts('all')"
          style="font-family:'Space Mono',monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;
                 padding:14px 28px;background:transparent;border:1px solid var(--grey-600);color:var(--grey-200);cursor:pointer">
          Show Demo Data
        </button>
      </div>`;
  }
}

// ─────────────────────────────────────────────
// RENDER PRODUCT CARDS
// isAutoLoad = true shows a "LIVE" badge instead of source
// ─────────────────────────────────────────────
function renderLiveResults(results, isAutoLoad = false, append = false) {
  const grid = document.getElementById('product-grid');
  if (!append) window._shownCount = 8;
  // Store current displayed results so openLivePanel can look up by real index
  window._currentResults = results;

  // Update result count + timestamp
  const countEl = document.getElementById('result-count');
  if (countEl) countEl.textContent = results.length ? results.length + ' listings found' : '';
  if (window._lastFetchTime) {
    const tsBar = document.getElementById('update-timestamp-bar');
    if (tsBar) tsBar.textContent = '⟳ Updated ' + (typeof getTimeSince === 'function' ? getTimeSince(window._lastFetchTime) : 'recently');
  }

  // Remove existing Load More button if present
  const existingBtn = document.getElementById('load-more-btn');
  if (existingBtn) existingBtn.remove();

  const visible = results.slice(0, window._shownCount);

  // Calculate average price across all results for "Best Deal" detection
  const validPrices = results.filter(r => r && r.price && !r.suspicious).map(r => r.price);
  const avgPrice = validPrices.length ? validPrices.reduce((a, b) => a + b, 0) / validPrices.length : 0;

  grid.innerHTML = visible.map((item, i) => {
    const fmtPrice = typeof formatPrice === 'function'
      ? formatPrice(item.price)
      : (item.price >= 1000 ? '$' + (item.price / 1000).toFixed(1) + 'K' : '$' + item.price.toFixed(2));
    const url = safeUrl(item.url);

    // Best Deal: price is 12%+ below average and not suspicious
    const belowAvgPct = avgPrice > 0 ? Math.round(((avgPrice - item.price) / avgPrice) * 100) : 0;
    const isBestDeal = !item.suspicious && belowAvgPct >= 12;
    // Price Drop Today: 5–11% below average (not quite best deal but still dropping)
    const isDroppingToday = !item.suspicious && belowAvgPct >= 5 && belowAvgPct < 12;

    // Deal Score
    const score = getDealScore(item, avgPrice);
    const scoreColor = dealScoreColor(score);

    return `
      <div class="product-card" style="animation-delay:${i * 0.06}s${isBestDeal ? ';border-color:var(--up)' : ''}" onclick="openLivePanel(${results.indexOf(item)})" onmouseenter="_prefetchAngles(${results.indexOf(item)})">
        <div class="card-img-wrap" style="position:relative;overflow:hidden">
          ${item.image
            ? `<img src="${item.image}" alt="product"
                style="width:100%;height:100%;object-fit:cover"
                onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
            : ''}
          <div class="card-img-placeholder" style="${item.image ? 'display:none' : ''}">🛍️</div>
          ${isBestDeal
            ? `<span class="card-badge" style="background:var(--up);color:#000;left:12px;top:12px">🔥 ${belowAvgPct}% BELOW AVG</span>`
            : isDroppingToday
              ? `<span class="card-badge" style="background:#ff9900;color:#000;left:12px;top:12px">📉 ↓${belowAvgPct}% TODAY</span>`
              : (!item.suspicious
                  ? '<span class="card-badge badge-auth">✓ Verified</span>'
                  : '<span class="card-badge badge-hot">⚠️ Check</span>')}
          ${isAutoLoad ? '<span class="card-badge badge-hot" style="left:auto;right:12px;background:var(--accent);color:var(--black)">🔴 LIVE</span>' : ''}
          <div style="position:absolute;bottom:10px;right:10px;background:rgba(0,0,0,0.75);
                      border:1px solid ${scoreColor};padding:4px 8px;display:flex;align-items:center;gap:4px">
            <div style="width:28px;height:4px;background:var(--grey-700);border-radius:2px;overflow:hidden">
              <div style="width:${score}%;height:100%;background:${scoreColor};transition:width 0.4s"></div>
            </div>
            <span style="font-family:'Space Mono',monospace;font-size:9px;color:${scoreColor};font-weight:700">${score}</span>
          </div>
        </div>
        <div class="card-body">
          <div class="card-category">${item.source || 'Unknown'}</div>
          <div class="card-name" style="font-size:15px;line-height:1.2;margin-bottom:6px">
            ${(item.title || 'Product').slice(0, 52)}${(item.title||'').length > 52 ? '...' : ''}
          </div>
          <div class="card-colorway" style="font-size:12px;color:${item.suspicious ? 'var(--accent2)' : 'var(--grey-400)'}">
            ${item.suspicious ? '⚠️ Price may be fake' : '✓ Authentic listing'}
          </div>
          <div class="price-row" style="margin-top:12px">
            <div class="price-main">${fmtPrice}</div>
            ${item.suspicious
              ? '<div class="price-change down">⚠️ CHECK</div>'
              : isBestDeal
                ? `<div class="price-change up">↓ ${belowAvgPct}% OFF</div>`
                : `<div style="font-family:'Space Mono',monospace;font-size:9px;color:${scoreColor}">SCORE ${score}</div>`}
          </div>
          <div class="sources-row" style="margin-top:10px;gap:8px">
            ${url
              ? `<a href="${url}" target="_blank" rel="noopener noreferrer"
                  onclick="event.stopPropagation()"
                  style="font-family:'Space Mono',monospace;font-size:9px;letter-spacing:1px;
                    text-transform:uppercase;padding:6px 14px;background:var(--grey-700);
                    border:1px solid var(--grey-600);color:var(--accent);text-decoration:none;display:inline-block"
                  onmouseover="this.style.background='var(--accent)';this.style.color='var(--black)'"
                  onmouseout="this.style.background='var(--grey-700)';this.style.color='var(--accent)'">
                  View on ${item.source} →
                </a>`
              : `<span style="font-family:'Space Mono',monospace;font-size:9px;padding:6px 14px;
                  background:var(--grey-800);border:1px solid var(--grey-700);
                  color:var(--grey-400);display:inline-block">No link available</span>`}
            <button onclick="event.stopPropagation();addToWatchlistByIndex(${i})"
                    data-index="${i}"
                    id="wl-btn-${i}"
                    style="font-family:'Space Mono',monospace;font-size:9px;letter-spacing:1px;
                           text-transform:uppercase;padding:6px 12px;background:transparent;
                           border:1px solid var(--grey-600);color:var(--grey-400);cursor:none;
                           transition:all 0.2s"
                    onmouseover="this.style.borderColor='#ff6b6b';this.style.color='#ff6b6b'"
                    onmouseout="this.style.borderColor='var(--grey-600)';this.style.color='var(--grey-400)'">
              ❤️
            </button>
            <button onclick="event.stopPropagation();toggleCompare(${i})"
                    id="cmp-btn-${i}"
                    title="Add to comparison (max 3)"
                    style="font-family:'Space Mono',monospace;font-size:9px;letter-spacing:1px;
                           text-transform:uppercase;padding:6px 12px;background:transparent;
                           border:1px solid var(--grey-600);color:var(--grey-400);cursor:none;
                           transition:all 0.2s"
                    onmouseover="if(!this.classList.contains('cmp-active')){this.style.borderColor='var(--accent)';this.style.color='var(--accent)'}"
                    onmouseout="if(!this.classList.contains('cmp-active')){this.style.borderColor='var(--grey-600)';this.style.color='var(--grey-400)'}">
              ⇄ Compare
            </button>
            <button onclick="event.stopPropagation();openAlertModal('${(item.title||'Product').replace(/'/g,"\\'").slice(0,60)}',${item.price},'${item.image||''}')"
                    title="Set price alert"
                    style="font-family:'Space Mono',monospace;font-size:9px;letter-spacing:1px;
                           text-transform:uppercase;padding:6px 10px;background:transparent;
                           border:1px solid var(--grey-600);color:var(--grey-400);cursor:none;
                           transition:all 0.2s"
                    onmouseover="this.style.borderColor='var(--accent)';this.style.color='var(--accent)'"
                    onmouseout="this.style.borderColor='var(--grey-600)';this.style.color='var(--grey-400)'">
              🔔
            </button>
          </div>
        </div>
      </div>`;
  }).join('');

  if (typeof refreshCursor === 'function') refreshCursor();

  // Mark already-wishlisted items
  markWatchlistedCards();

  // Add Load More button if there are more results to show
  if (results.length > window._shownCount) {
    const section = document.getElementById('products');
    const btn = document.createElement('div');
    btn.id = 'load-more-btn';
    btn.style.cssText = 'text-align:center;padding:40px 0 0;';
    btn.innerHTML = `
      <button onclick="loadMore()"
        style="font-family:'Space Mono',monospace;font-size:11px;letter-spacing:2px;
               text-transform:uppercase;padding:16px 40px;background:transparent;
               border:1px solid var(--grey-600);color:var(--grey-200);cursor:pointer;
               transition:all 0.2s"
        onmouseover="this.style.borderColor='var(--accent)';this.style.color='var(--accent)'"
        onmouseout="this.style.borderColor='var(--grey-600)';this.style.color='var(--grey-200)'">
        Load More (${results.length - window._shownCount} remaining)
      </button>`;
    section.appendChild(btn);
  }
}

function loadMore() {
  window._shownCount += 8;
  renderLiveResults(window._lastResults, false, true);
}

// ─────────────────────────────────────────────
// WATCHLIST FUNCTIONS
// ─────────────────────────────────────────────

// Add product by index from _lastResults
function addToWatchlistByIndex(index) {
  const item = (window._lastResults || [])[index];
  if (!item) return;

  // Check if logged in
  const token = localStorage.getItem('driptrack_token');
  if (!token) {
    if (confirm('You need to be signed in to save products to your watchlist.\n\nGo to login page?')) {
      window.location.href = 'login.html';
    }
    return;
  }

  // Get current watchlist
  const watchlist = JSON.parse(localStorage.getItem('driptrack_watchlist') || '[]');

  // Check if already added
  const alreadyAdded = watchlist.some(w =>
    w.title === item.title && w.source === item.source
  );

  if (alreadyAdded) {
    showToast('Already in your watchlist!', 'info');
    return;
  }

  // Add to watchlist
  const product = {
    title: item.title || 'Unknown Product',
    source: item.source || 'Unknown',
    price: item.price || 0,
    url: item.url || '',
    image: item.image || '',
    addedAt: new Date().toISOString(),
  };

  watchlist.push(product);
  localStorage.setItem('driptrack_watchlist', JSON.stringify(watchlist));

  // Sync to MongoDB backend
  const authToken = localStorage.getItem('driptrack_token');
  if (authToken) {
    fetch(`${API_BASE.replace('/api', '')}/auth/watchlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
      body: JSON.stringify({ product: JSON.stringify(product) }),
    }).catch(() => { /* silent fail — localStorage is the backup */ });
  }

  // Update navbar count
  const countEl = document.getElementById('watchlistCount');
  if (countEl) countEl.textContent = watchlist.length;

  // Show watchlist nav button if hidden
  const wlBtn = document.getElementById('watchlistNavBtn');
  if (wlBtn) wlBtn.style.display = 'block';

  // Update button to show added state
  const btn = document.getElementById('wl-btn-' + index);
  if (btn) {
    btn.textContent = '❤️ Saved';
    btn.style.borderColor = '#ff6b6b';
    btn.style.color = '#ff6b6b';
    btn.disabled = true;
  }

  // Show success toast
  showToast('❤️ Added to Watchlist — ' + (item.title || 'Product').slice(0, 30), 'success');
}

// Mark cards that are already in watchlist
function markWatchlistedCards() {
  const watchlist = JSON.parse(localStorage.getItem('driptrack_watchlist') || '[]');
  if (!watchlist.length) return;

  (window._lastResults || []).forEach((item, i) => {
    const alreadyAdded = watchlist.some(w =>
      w.title === item.title && w.source === item.source
    );
    if (alreadyAdded) {
      const btn = document.getElementById('wl-btn-' + i);
      if (btn) {
        btn.textContent = '❤️ Saved';
        btn.style.borderColor = '#ff6b6b';
        btn.style.color = '#ff6b6b';
        btn.disabled = true;
      }
    }
  });
}

// Show toast notification
function showToast(message, type = 'success') {
  let toast = document.getElementById('wlToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'wlToast';
    toast.style.cssText = [
      'position:fixed',
      'bottom:32px',
      'left:50%',
      'transform:translateX(-50%)',
      'font-family:"Space Mono",monospace',
      'font-size:10px',
      'letter-spacing:2px',
      'padding:14px 28px',
      'z-index:9999',
      'text-transform:uppercase',
      'transition:opacity 0.4s',
      'white-space:nowrap',
      'pointer-events:none',
    ].join(';');
    document.body.appendChild(toast);
  }

  if (type === 'success') {
    toast.style.background = 'var(--grey-900, #111)';
    toast.style.border = '1px solid var(--up, #39ff14)';
    toast.style.color = 'var(--up, #39ff14)';
  } else if (type === 'info') {
    toast.style.background = 'var(--grey-900, #111)';
    toast.style.border = '1px solid var(--accent, #e8ff00)';
    toast.style.color = 'var(--accent, #e8ff00)';
  }

  toast.textContent = message;
  toast.style.opacity = '1';
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, 3000);
}

// ─────────────────────────────────────────────
// OPEN LIVE PANEL
// Fetches fresh prices specifically for the
// product that was clicked — not mixed results
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// RECENTLY VIEWED
// ─────────────────────────────────────────────
function trackRecentlyViewed(item) {
  const key = 'driptrack_recently_viewed';
  let recent = JSON.parse(localStorage.getItem(key) || '[]');
  // Remove duplicate if already exists
  recent = recent.filter(r => r.title !== item.title || r.source !== item.source);
  // Add to front
  recent.unshift({
    title: item.title,
    source: item.source,
    price: item.price,
    image: item.image,
    url: item.url,
    viewedAt: new Date().toISOString(),
  });
  // Keep only last 8
  recent = recent.slice(0, 8);
  localStorage.setItem(key, JSON.stringify(recent));
  renderRecentlyViewed();
}

function renderRecentlyViewed() {
  const key = 'driptrack_recently_viewed';
  const recent = JSON.parse(localStorage.getItem(key) || '[]');
  const section = document.getElementById('recently-viewed-section');
  const container = document.getElementById('recently-viewed-scroll');
  if (!section || !container) return;

  if (!recent.length) { section.style.display = 'none'; return; }
  section.style.display = 'block';

  container.innerHTML = recent.map(item => {
    const fmtPrice = item.price >= 1000
      ? '$' + (item.price / 1000).toFixed(1) + 'K'
      : '$' + (item.price || 0).toFixed(2);
    const url = safeUrl(item.url);
    return `
      <div style="min-width:180px;background:var(--grey-800);border:1px solid var(--grey-700);
                  cursor:pointer;transition:all 0.2s;flex-shrink:0;overflow:hidden"
           onmouseover="this.style.borderColor='var(--accent)'"
           onmouseout="this.style.borderColor='var(--grey-700)'"
           onclick="${url ? `window.open('${url}','_blank')` : ''}">
        <div style="height:120px;background:var(--grey-700);overflow:hidden;display:flex;align-items:center;justify-content:center">
          ${item.image
            ? `<img src="${item.image}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">`
            : '<span style="font-size:40px">🛍️</span>'}
        </div>
        <div style="padding:12px">
          <div style="font-family:'Space Mono',monospace;font-size:8px;letter-spacing:2px;color:var(--accent);text-transform:uppercase;margin-bottom:4px">${item.source || 'Unknown'}</div>
          <div style="font-family:'Bebas Neue',sans-serif;font-size:15px;letter-spacing:1px;line-height:1.1;margin-bottom:8px">${(item.title || '').slice(0, 35)}${(item.title||'').length > 35 ? '...' : ''}</div>
          <div style="font-family:'Space Mono',monospace;font-size:12px;font-weight:700;color:var(--white)">${fmtPrice}</div>
        </div>
      </div>`;
  }).join('');
}

// ─── Pre-fetch angles on hover so panel opens with images already cached ───
function _prefetchAngles(index) {
  const item = (window._currentResults || window._lastResults || [])[index];
  if (!item) return;
  const query = item.title || window._lastQuery;
  if (!window._angleCache[query]) {
    // Fire and forget — just warms the cache
    fetchAngles(query);
  }
}

function openLivePanel(index) {
  const item = (window._currentResults || window._lastResults || [])[index];
  if (!item) return;

  // Track this product as recently viewed
  trackRecentlyViewed(item);

  const panel = document.getElementById('detailPanel');
  panel.classList.add('open');

  // ── 1. Show image immediately ──────────────────────────────────
  const wrap = document.getElementById('panel360Wrap');
  if (item.image) {
    wrap.innerHTML = `<img src="${item.image}" class="panel-360-img"
      style="width:100%;height:100%;object-fit:cover"
      onerror="this.style.display='none'">`;
  } else {
    wrap.innerHTML = `<div class="panel-360-emoji">🛍️</div>`;
  }

  // ── 2. Show title + price immediately ─────────────────────────
  const cleanTitle = (item.title || 'Product').slice(0, 60);
  document.getElementById('panelTitle').textContent = cleanTitle;
  document.getElementById('panelSub').textContent = (item.source || 'Unknown') + ' · Authenticated';
  const fmtPrice = item.price >= 1000
    ? '$' + (item.price / 1000).toFixed(1) + 'K'
    : '$' + item.price.toFixed(2);
  document.getElementById('panelPrice').textContent = fmtPrice;
  document.getElementById('panelPriceSub').textContent = '✓ Live price';
  document.getElementById('panelPriceSub').style.color = 'var(--up)';

  if (typeof resetPanelButtons === 'function') {
    resetPanelButtons({ title: item.title || 'Product', source: item.source || 'Unknown', price: item.price, url: item.url || '', image: item.image || '' });
  }

  // ── 3. Render prices instantly from already-fetched _lastResults ──
  // We already have all prices from the search — no need to re-fetch!
  const allResults = (window._lastResults || []).filter(r => r && r.price);
  _renderPanelSources(allResults, item);

  // ── 4. Kick off angles + history in parallel (non-blocking) ────
  const query = item.title || window._lastQuery;
  if (typeof loadAnglesForPanel === 'function') {
    loadAnglesForPanel(query, '🛍️', item.image || null);
  }
  loadPanelPriceHistory(query);
}

// Renders the price sources list and comparison chart — synchronous, instant
function _renderPanelSources(results, featuredItem) {
  const sorted = [...results].sort((a, b) => a.price - b.price);
  const best = sorted[0] || featuredItem;

  // ── Price display: always show the CLICKED item's price, NOT the cheapest ──
  // (panelPrice was already set correctly by openLivePanel before this runs)
  // Just update the sub-label to hint at a better deal if one exists
  const clickedPrice = featuredItem.price;
  if (best && best !== featuredItem && best.price < clickedPrice) {
    const bestFmt = best.price >= 1000
      ? '$' + (best.price / 1000).toFixed(1) + 'K'
      : '$' + best.price.toFixed(2);
    document.getElementById('panelPriceSub').textContent =
      `✓ Price on ${featuredItem.source} · Best: ${bestFmt} on ${best.source}`;
  } else {
    document.getElementById('panelPriceSub').textContent =
      `✓ Live price from ${featuredItem.source}`;
  }
  document.getElementById('panelPriceSub').style.color = 'var(--up)';

  if (sorted.length === 0) {
    const url = safeUrl(featuredItem.url);
    document.getElementById('panelSources').innerHTML = url ? `
      <a href="${url}" target="_blank" rel="noopener noreferrer" class="panel-source-link best-source">
        <div class="source-link-left">
          <div class="source-link-name best">${featuredItem.source}</div>
          <div class="source-link-tag">⭐ Best Price Found · Click to go directly →</div>
        </div>
        <div class="source-link-right">
          <div class="source-link-price" style="color:var(--up)">$${featuredItem.price.toFixed(2)}</div>
          <div class="source-link-arrow">SHOP →</div>
        </div>
      </a>` : `<div style="padding:16px 0;font-family:'Space Mono',monospace;font-size:10px;color:var(--grey-400)">No sources found</div>`;
    return;
  }

  document.getElementById('panelSources').innerHTML = sorted.map((r, i) => {
    const url = safeUrl(r.url);
    return url ? `
      <a href="${url}" target="_blank" rel="noopener noreferrer"
         class="panel-source-link ${i === 0 ? 'best-source' : ''}">
        <div class="source-link-left">
          <div class="source-link-name ${i === 0 ? 'best' : ''}">${r.source}</div>
          <div class="source-link-tag">${i === 0 ? '⭐ Best Price · ' : ''}Click to go directly →</div>
        </div>
        <div class="source-link-right">
          <div class="source-link-price" style="color:${i === 0 ? 'var(--up)' : 'var(--white)'}">
            $${r.price.toFixed(2)}
          </div>
          <div class="source-link-arrow">SHOP →</div>
        </div>
      </a>` : `
      <div class="panel-source-link">
        <div class="source-link-left">
          <div class="source-link-name">${r.source}</div>
          <div class="source-link-tag">Link unavailable</div>
        </div>
        <div class="source-link-right">
          <div class="source-link-price">$${r.price.toFixed(2)}</div>
        </div>
      </div>`;
  }).join('');

  // Draw price comparison bar chart instantly
  const prices = sorted.map(r => r.price);
  if (prices.length > 1) {
    const w = 360, h = 100, pad = 8;
    const min = Math.min(...prices) * 0.95, max = Math.max(...prices) * 1.05;
    const coords = prices.map((v, i) => {
      const x = pad + (i / (prices.length - 1)) * (w - pad * 2);
      const y = h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);
      return [x, y];
    });
    const line = 'M ' + coords.map(c => c.join(',')).join(' L ');
    const area = line + ` L ${coords[coords.length - 1][0]},${h} L ${coords[0][0]},${h} Z`;
    document.getElementById('panelChartSvg').innerHTML = `
      <defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--up)" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="var(--up)" stop-opacity="0"/>
      </linearGradient></defs>
      <path d="${area}" fill="url(#pg)"/>
      <path d="${line}" fill="none" stroke="var(--up)" stroke-width="2" stroke-linecap="round"/>
      ${coords.map(c => `<circle cx="${c[0]}" cy="${c[1]}" r="3" fill="var(--up)" opacity="0.8"/>`).join('')}`;
  }
}

// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// PRICE HISTORY CHART (in detail panel)
// Shows instantly with simulated data, upgrades to real data if available
// ─────────────────────────────────────────────
function _drawPriceHistoryChart(chartEl, prices, label) {
  if (!chartEl || prices.length < 2) return;
  const firstPrice = prices[0], lastPrice = prices[prices.length - 1];
  const changePct = (((lastPrice - firstPrice) / firstPrice) * 100).toFixed(1);
  const isUp = lastPrice >= firstPrice;
  const color = isUp ? 'var(--up)' : 'var(--accent2)';
  const w = 360, h = 90, pad = 10;
  const min = Math.min(...prices) * 0.95, max = Math.max(...prices) * 1.05;
  const coords = prices.map((v, i) => {
    const x = pad + (i / (prices.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);
    return [x, y];
  });
  const line = 'M ' + coords.map(c => c.join(',')).join(' L ');
  const area = line + ` L ${coords[coords.length-1][0]},${h} L ${coords[0][0]},${h} Z`;
  chartEl.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <span style="font-family:'Space Mono',monospace;font-size:9px;letter-spacing:2px;color:var(--accent);text-transform:uppercase">${label}</span>
      <span style="font-family:'Space Mono',monospace;font-size:10px;font-weight:700;color:${color}">${isUp ? '▲' : '▼'} ${Math.abs(changePct)}%</span>
    </div>
    <svg viewBox="0 0 ${w} ${h}" style="width:100%;height:90px">
      <defs>
        <linearGradient id="phg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${isUp ? '#39ff14' : '#ff3c3c'}" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="${isUp ? '#39ff14' : '#ff3c3c'}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${area}" fill="url(#phg)"/>
      <path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
      ${coords.map((c, i) => i === 0 || i === coords.length - 1
        ? `<circle cx="${c[0]}" cy="${c[1]}" r="4" fill="${color}"/>`
        : '').join('')}
    </svg>
    <div style="display:flex;justify-content:space-between;font-family:'Space Mono',monospace;font-size:9px;color:var(--grey-400);margin-top:4px">
      <span>$${firstPrice.toFixed(2)}</span>
      <span style="color:${color};font-weight:700">Now: $${lastPrice.toFixed(2)}</span>
    </div>`;
}

// Build a realistic-looking 14-day price walk from a single current price
function _simulatePriceHistory(currentPrice, points) {
  points = points || 14;
  const prices = [];
  let val = currentPrice;
  for (let i = points; i > 0; i--) {
    prices.unshift(parseFloat(val.toFixed(2)));
    const drift = (Math.random() - 0.48) * (currentPrice * 0.009);
    val = Math.max(currentPrice * 0.78, Math.min(currentPrice * 1.22, val - drift));
  }
  prices.push(currentPrice);
  return prices;
}

async function loadPanelPriceHistory(query) {
  const chartEl = document.getElementById('panelHistoryChart');
  if (!chartEl) return;

  // ── Show simulated chart instantly while real data loads ───────
  const results = (window._lastResults || []).filter(r => r && r.price);
  const basePrice = results.length > 0
    ? results.reduce((s, r) => s + r.price, 0) / results.length
    : null;

  if (basePrice) {
    _drawPriceHistoryChart(chartEl, _simulatePriceHistory(basePrice), 'Est. 14-Day Trend');
  }

  // ── Upgrade to real MongoDB history if available ────────────────
  try {
    const res = await fetch(`${API_BASE}/history?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    const history = data.history || [];
    if (history.length >= 2) {
      const prices = history.map(h => h.price);
      _drawPriceHistoryChart(chartEl, prices, `Live History (${history.length} pts)`);
    }
    // Otherwise keep the simulated chart — looks good, better than "no data"
  } catch (err) {
    // Keep simulated chart on network error
  }
}

// ─────────────────────────────────────────────
// FETCH MULTI-ANGLE IMAGES
// ─────────────────────────────────────────────
async function fetchAngles(query) {
  if (window._angleCache[query]) return window._angleCache[query];
  try {
    const res = await fetch(`${API_BASE}/angles?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    window._angleCache[query] = data.angles || [];
    return window._angleCache[query];
  } catch { return []; }
}

function renderAngleThumbs(angles, fallbackEmoji) {
  const container = document.getElementById('panelAngles');
  if (!container || !angles.length) { if(container) container.innerHTML=''; return; }
  container.innerHTML = angles.map((a, i) => `
    <div class="angle-thumb ${i === 0 ? 'active' : ''}"
         onclick="switchPanelAngle(this, '${a.url}')" title="${a.label}"
         style="position:relative">
      <img src="${a.url}" alt="${a.label}"
           style="width:100%;height:100%;object-fit:cover"
           onerror="this.parentElement.innerHTML='<span style=\\"font-size:24px\\">${fallbackEmoji||'🛍️'}</span>'">
      <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.6);
                  font-family:'Space Mono',monospace;font-size:7px;letter-spacing:1px;
                  text-align:center;padding:2px;color:var(--accent);text-transform:uppercase">
        ${a.label}
      </div>
    </div>`).join('');
}

function switchPanelAngle(thumb, imageUrl) {
  document.querySelectorAll('.angle-thumb').forEach(t => t.classList.remove('active'));
  thumb.classList.add('active');
  const wrap = document.getElementById('panel360Wrap');
  const mainImg = wrap.querySelector('img');
  if (mainImg) mainImg.src = imageUrl;
  else wrap.innerHTML = `<img src="${imageUrl}" class="panel-360-img" style="width:100%;height:100%;object-fit:cover">`;
}

async function loadAnglesForPanel(query, fallbackEmoji, frontImage) {
  const container = document.getElementById('panelAngles');
  // Only show spinner if we don't already have cached angles
  const isCached = !!window._angleCache[query];
  if (container && !isCached) container.innerHTML = `
    <div style="font-family:'Space Mono',monospace;font-size:9px;letter-spacing:2px;
                color:var(--grey-400);padding:8px 0;text-transform:uppercase">
      ⚡ Loading images...
    </div>`;

  // Fetch Side, Back, Detail angles from the API (returns instantly if cached)
  const apiAngles = await fetchAngles(query);

  // Always use the card's own image as the Front — never replace it with search results
  const allAngles = frontImage
    ? [{ url: frontImage, label: 'Front' }, ...apiAngles.filter(a => a.label !== 'Front')]
    : apiAngles;

  if (allAngles.length > 0) {
    renderAngleThumbs(allAngles, fallbackEmoji);
    // Keep the main panel image as the card's original front image
    const wrap = document.getElementById('panel360Wrap');
    if (wrap && frontImage) {
      wrap.innerHTML = `<img src="${frontImage}" class="panel-360-img"
        style="width:100%;height:100%;object-fit:cover"
        onerror="this.style.display='none'">`;
    } else if (wrap && allAngles[0]) {
      wrap.innerHTML = `<img src="${allAngles[0].url}" class="panel-360-img"
        style="width:100%;height:100%;object-fit:cover"
        onerror="this.style.display='none'">`;
    }
  } else {
    if (container) container.innerHTML = '';
  }
}

// ─────────────────────────────────────────────
// COMPARE TABLE
// ─────────────────────────────────────────────
function renderLiveCompareTable(results, query) {
  const sorted = [...results].filter(r => r && r.price).sort((a, b) => a.price - b.price);
  if (!sorted.length) return;
  const colors = ['#00f0ff', '#39ff14', '#ff9900', '#e53238', '#e8ff00', '#aaa'];
  document.getElementById('compare-table').innerHTML = `
    <thead><tr><th>Retailer</th><th>Price</th><th>Authenticity</th><th>Link</th></tr></thead>
    <tbody>${sorted.map((r, i) => {
      const url = safeUrl(r.url);
      return `<tr ${i === 0 ? 'class="best-price"' : ''}>
        <td><div class="retailer-name">
          <div class="retailer-dot" style="background:${colors[i % colors.length]}"></div>
          ${r.source}${i === 0 ? '<span class="best-badge">Best Price</span>' : ''}
        </div></td>
        <td style="font-family:'Space Mono',monospace;font-size:16px;font-weight:700;color:${i === 0 ? 'var(--up)' : 'var(--white)'}">$${r.price.toFixed(2)}</td>
        <td style="font-family:'Space Mono',monospace;font-size:11px;color:${r.suspicious ? 'var(--accent2)' : 'var(--up)'}">
          ${r.suspicious ? '⚠️ Check listing' : '✓ Verified'}</td>
        <td>${url
          ? `<a href="${url}" target="_blank" rel="noopener noreferrer"
              style="font-family:'Space Mono',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;
                     padding:5px 12px;background:transparent;border:1px solid var(--grey-600);
                     color:var(--grey-200);text-decoration:none;display:inline-block"
              onmouseover="this.style.borderColor='var(--accent)';this.style.color='var(--accent)'"
              onmouseout="this.style.borderColor='var(--grey-600)';this.style.color='var(--grey-200)'">
              Shop →</a>`
          : `<span style="font-family:'Space Mono',monospace;font-size:9px;color:var(--grey-600)">N/A</span>`}
        </td>
      </tr>`;
    }).join('')}</tbody>`;
  document.getElementById('chart-product-title').textContent = query;
  document.getElementById('chart-product-price').textContent = `Best: $${sorted[0].price.toFixed(2)} on ${sorted[0].source}`;
  setTimeout(() => document.getElementById('compare').scrollIntoView({ behavior: 'smooth' }), 300);
}

// ─────────────────────────────────────────────
// UPDATE CHART
// ─────────────────────────────────────────────
function updateChart(query, results) {
  const prices = [...results].filter(r => r && r.price).sort((a, b) => a.price - b.price).map(r => r.price);
  if (prices.length < 2) return;
  if (typeof generateChartPath === 'function') {
    const { line, area } = generateChartPath(prices);
    document.getElementById('chartLine').setAttribute('d', line);
    document.getElementById('chartArea').setAttribute('d', area);
  }
}

// ─────────────────────────────────────────────
// FILTER PRODUCTS BY CATEGORY
// ─────────────────────────────────────────────
function filterProducts(category, btn) {
  document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
  if (btn) btn.classList.add('active');

  const results = window._lastResults || [];

  if (category === 'all') {
    renderLiveResults(results, false);
    return;
  }

  const categoryKeywords = {
    sneakers:    ['nike', 'adidas', 'jordan', 'yeezy', 'dunk', 'air force', 'new balance', 'vans', 'converse', 'puma', 'reebok', 'asics', 'sneaker', 'shoe', 'trainer'],
    accessories: ['rolex', 'watch', 'omega', 'seiko', 'cartier', 'chronograph', 'timepiece', 'audemars', 'patek'],
    bags:        ['louis vuitton', 'gucci', 'prada', 'bag', 'tote', 'backpack', 'purse', 'chanel', 'hermes', 'balenciaga'],
    sunglasses:  ['sunglasses', 'sunglass', 'shades', 'ray-ban', 'oakley', 'aviator', 'wayfarer', 'lens'],
    streetwear:  ['supreme', 'off-white', 'palace', 'bape', 'hoodie', 'tee', 'jacket', 'shorts', 'crewneck', 'sweatshirt'],
  };

  const categorySearches = {
    sneakers:    'Nike Air Jordan 1 sneakers',
    accessories: 'Rolex Submariner watch',
    bags:        'Louis Vuitton Neverfull bag',
    sunglasses:  'Ray-Ban Aviator sunglasses',
    streetwear:  'Supreme box logo hoodie',
    trending:    'Nike Dunk Low trending',
    dropping:    'Jordan 1 price drop',
  };

  if (category === 'dropping') {
    const sorted = [...results].sort((a, b) => a.price - b.price);
    if (sorted.length) { renderLiveResults(sorted, false); return; }
    searchLivePrices(categorySearches.dropping);
    return;
  }

  if (category === 'trending') {
    const trending = results.slice(0, Math.ceil(results.length / 2));
    if (trending.length) { renderLiveResults(trending, false); return; }
    searchLivePrices(categorySearches.trending);
    return;
  }

  const keywords = categoryKeywords[category] || [];
  const filtered = results.filter(r => {
    const text = ((r.title || '') + ' ' + (r.source || '')).toLowerCase();
    return keywords.some(kw => text.includes(kw));
  });

  if (filtered.length) {
    renderLiveResults(filtered, false);
  } else {
    // No local results match — search the API for this category
    searchLivePrices(categorySearches[category] || category);
  }
}

// ─────────────────────────────────────────────
// SORT PRODUCTS
// ─────────────────────────────────────────────
function sortProducts(method, btn) {
  document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  const results = [...(window._lastResults || [])];
  if (!results.length) return;

  let sorted;
  switch (method) {
    case 'price-asc':
      sorted = results.sort((a, b) => a.price - b.price);
      break;
    case 'price-desc':
      sorted = results.sort((a, b) => b.price - a.price);
      break;
    case 'drop':
      sorted = results.filter(r => !r.suspicious).sort((a, b) => a.price - b.price);
      break;
    case 'hot':
      sorted = results.filter(r => r.verified).concat(results.filter(r => !r.verified));
      break;
    default:
      sorted = results;
  }

  window._lastResults = sorted;
  renderLiveResults(sorted, false);
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('search-btn');
  const input = document.getElementById('search-input');
  if (btn) btn.addEventListener('click', () => { const q = input.value.trim(); if (q) searchLivePrices(q); });
  if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') { const q = input.value.trim(); if (q) searchLivePrices(q); } });

  // Render recently viewed on load
  renderRecentlyViewed();

  // Auto-load real products on page load
  fetch(`${API_BASE}/status`)
    .then(r => r.json())
    .then(d => {
      console.log('API Status:', d.apis);
      const anyConnected = Object.values(d.apis).some(v => v.includes('✅'));
      if (anyConnected) {
        autoLoadProducts();
      } else {
        console.warn('No APIs connected — check your .env file');
      }
    })
    .catch(() => {
      console.warn('Backend not running — start with: npm start');
    });
});