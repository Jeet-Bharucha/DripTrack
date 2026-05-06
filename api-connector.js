// ─────────────────────────────────────────────
// DRIPTRACK — API Connector v5
// Auto-loads real live products on page load
// ─────────────────────────────────────────────
const API_BASE = 'http://localhost:3000/api';
window._lastResults = [];
window._angleCache = {};
window._lastQuery = '';

// Trending searches to auto-load on the main page
// These rotate so the page always feels fresh
const AUTO_SEARCH_QUERIES = [
  'Nike Air Jordan 1',
  'Adidas Yeezy Boost 350',
  'Rolex Submariner',
  'Ray-Ban Aviator',
  'Supreme Hoodie',
  'Louis Vuitton Bag',
  'New Balance 550',
  'Nike Dunk Low',
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
  grid.innerHTML = Array(8).fill(0).map((_, i) => `
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
    // Pick 4 random queries from the list for variety
    const shuffled = AUTO_SEARCH_QUERIES.sort(() => Math.random() - 0.5).slice(0, 4);

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
  } else {
    grid.innerHTML = `
      <div style="grid-column:1/-1;padding:80px 40px;text-align:center">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:48px;letter-spacing:4px;color:var(--grey-600);margin-bottom:16px">NO LIVE DATA</div>
        <div style="font-family:'Space Mono',monospace;font-size:11px;letter-spacing:2px;color:var(--grey-400);margin-bottom:32px">Make sure your backend is running and API keys are set</div>
        <button onclick="autoLoadProducts()" style="font-family:'Space Mono',monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;padding:14px 28px;background:var(--accent);color:var(--black);border:none;cursor:pointer;font-weight:700">
          Try Again
        </button>
      </div>`;
  }
}

// ─────────────────────────────────────────────
// SEARCH (manual search by user)
// ─────────────────────────────────────────────
async function searchLivePrices(query) {
  if (!query || query.trim() === '') return;

  window._lastQuery = query;
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

    if (!window._lastResults.length) {
      grid.innerHTML = `
        <div style="grid-column:1/-1;padding:60px;text-align:center;
          font-family:'Space Mono',monospace;font-size:12px;color:var(--grey-400)">
          No results found for "${query}" — try a different search
        </div>`;
      return;
    }

    renderLiveResults(window._lastResults, false);
    renderLiveCompareTable(window._lastResults, query);
    updateChart(query, window._lastResults);

  } catch (err) {
    console.error('Search error:', err);
    showEmptyState(document.getElementById('product-grid'));
  }
}

// ─────────────────────────────────────────────
// RENDER PRODUCT CARDS
// isAutoLoad = true shows a "LIVE" badge instead of source
// ─────────────────────────────────────────────
function renderLiveResults(results, isAutoLoad = false) {
  const grid = document.getElementById('product-grid');

  grid.innerHTML = results.map((item, i) => {
    const fmtPrice = typeof formatPrice === 'function'
      ? formatPrice(item.price)
      : (item.price >= 1000 ? '$' + (item.price / 1000).toFixed(1) + 'K' : '$' + item.price.toFixed(2));
    const url = safeUrl(item.url);
    const isUp = Math.random() > 0.4; // visual indicator (real change % needs history data)

    return `
      <div class="product-card" style="animation-delay:${i * 0.06}s" onclick="openLivePanel(${i})">
        <div class="card-img-wrap" style="position:relative;overflow:hidden">
          ${item.image
            ? `<img src="${item.image}" alt="product"
                style="width:100%;height:100%;object-fit:cover"
                onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
            : ''}
          <div class="card-img-placeholder" style="${item.image ? 'display:none' : ''}">🛍️</div>
          ${!item.suspicious
            ? '<span class="card-badge badge-auth">✓ Verified</span>'
            : '<span class="card-badge badge-hot">⚠️ Check</span>'}
          ${isAutoLoad ? '<span class="card-badge badge-hot" style="left:auto;right:12px;background:var(--accent);color:var(--black)">🔴 LIVE</span>' : ''}
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
              : ''}
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
          </div>
        </div>
      </div>`;
  }).join('');

  if (typeof refreshCursor === 'function') refreshCursor();

  // Mark already-wishlisted items
  markWatchlistedCards();
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
async function openLivePanel(index) {
  const item = (window._lastResults || [])[index];
  if (!item) return;

  const panel = document.getElementById('detailPanel');
  panel.classList.add('open');

  // Show product image immediately
  const wrap = document.getElementById('panel360Wrap');
  if (item.image) {
    wrap.innerHTML = `<img src="${item.image}" class="panel-360-img"
      style="width:100%;height:100%;object-fit:cover"
      onerror="this.style.display='none'">`;
  } else {
    wrap.innerHTML = `<div class="panel-360-emoji">🛍️</div>`;
  }

  // Show title and basic info immediately
  const cleanTitle = (item.title || 'Product').slice(0, 45) + '...';
  document.getElementById('panelTitle').textContent = cleanTitle;
  document.getElementById('panelSub').textContent = (item.source || 'Unknown') + ' · Authenticated';
  const fmtPrice = item.price >= 1000
    ? '$' + (item.price / 1000).toFixed(1) + 'K'
    : '$' + item.price.toFixed(2);
  document.getElementById('panelPrice').textContent = fmtPrice;
  // Set panel action buttons
  if (typeof resetPanelButtons === 'function') {
    resetPanelButtons({ title: item.title || 'Product', source: item.source || 'Unknown', price: item.price, url: item.url || '', image: item.image || '' });
  }
  document.getElementById('panelPriceSub').textContent = '⚡ Loading prices across all stores...';
  document.getElementById('panelPriceSub').style.color = 'var(--accent)';

  // Show loading state in sources
  document.getElementById('panelSources').innerHTML = `
    <div style="padding:20px 0;font-family:'Space Mono',monospace;font-size:10px;
                letter-spacing:2px;color:var(--grey-400);text-transform:uppercase">
      ⚡ Fetching real prices for this product...
    </div>`;

  // Use the product's own title as the search query
  // This ensures prices are specific to THIS product
  const productQuery = item.title
    ? item.title.slice(0, 60)  // use full title for accuracy
    : window._lastQuery;

  try {
    // Fetch prices specifically for this product
    const res = await fetch(`${API_BASE}/prices?q=${encodeURIComponent(productQuery)}`);
    const data = await res.json();
    const productPrices = (data.results || []).filter(r => r && r.price);

    if (productPrices.length > 0) {
      const sorted = [...productPrices].sort((a, b) => a.price - b.price);
      const best = sorted[0];

      // Update price to show best found price
      const bestFmt = best.price >= 1000
        ? '$' + (best.price / 1000).toFixed(1) + 'K'
        : '$' + best.price.toFixed(2);
      document.getElementById('panelPrice').textContent = bestFmt;
      document.getElementById('panelPriceSub').textContent = `✓ Best price on ${best.source}`;
      document.getElementById('panelPriceSub').style.color = 'var(--up)';

      // Render clickable source rows with REAL product-specific prices
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

      // Draw price comparison chart
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

    } else {
      // No results found — show the single known price with a shop link
      const url = safeUrl(item.url);
      document.getElementById('panelPriceSub').textContent = '✓ Live price';
      document.getElementById('panelPriceSub').style.color = 'var(--up)';
      document.getElementById('panelSources').innerHTML = url ? `
        <a href="${url}" target="_blank" rel="noopener noreferrer" class="panel-source-link best-source">
          <div class="source-link-left">
            <div class="source-link-name best">${item.source}</div>
            <div class="source-link-tag">⭐ Best Price Found · Click to go directly →</div>
          </div>
          <div class="source-link-right">
            <div class="source-link-price" style="color:var(--up)">$${item.price.toFixed(2)}</div>
            <div class="source-link-arrow">SHOP →</div>
          </div>
        </a>` : `
        <div style="padding:16px 0;font-family:'Space Mono',monospace;font-size:10px;
                    color:var(--grey-400);letter-spacing:1px">
          No additional sources found for this product
        </div>`;
    }

  } catch (err) {
    console.error('Panel price fetch error:', err);
    document.getElementById('panelPriceSub').textContent = 'Could not load prices';
    document.getElementById('panelPriceSub').style.color = 'var(--accent2)';
  }

  // Fetch multi-angle images using product title
  if (typeof loadAnglesForPanel === 'function') {
    loadAnglesForPanel(item.title || window._lastQuery, '🛍️');
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

async function loadAnglesForPanel(query, fallbackEmoji) {
  const container = document.getElementById('panelAngles');
  if (container) container.innerHTML = `
    <div style="font-family:'Space Mono',monospace;font-size:9px;letter-spacing:2px;
                color:var(--grey-400);padding:8px 0;text-transform:uppercase">
      ⚡ Loading images...
    </div>`;
  const angles = await fetchAngles(query);
  if (angles.length > 0) {
    renderAngleThumbs(angles, fallbackEmoji);
    const wrap = document.getElementById('panel360Wrap');
    if (wrap && angles[0]) {
      wrap.innerHTML = `<img src="${angles[0].url}" class="panel-360-img"
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
// INIT
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('search-btn');
  const input = document.getElementById('search-input');
  if (btn) btn.addEventListener('click', () => { const q = input.value.trim(); if (q) searchLivePrices(q); });
  if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') { const q = input.value.trim(); if (q) searchLivePrices(q); } });

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