const axios = require('axios');
const { normalizeListing, safeUrl } = require('./catalog');
const states = {};
const cache = new Map();
const pending = new Map();
const TTL = 60 * 60 * 1000;
const providers = ['Amazon / Rainforest', 'eBay', 'Google Shopping / SerpAPI'];
function configured(name) {
  return name === providers[0] ? !!process.env.RAINFOREST_API_KEY : name === providers[1]
    ? !!(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET) : !!process.env.SERPAPI_KEY;
}
function providerStatus() {
  return providers.map(name => ({ name, configured: configured(name), status: !configured(name) ? 'not_configured' : states[name]?.status || 'not_checked', checkedAt: states[name]?.checkedAt || null }));
}
async function run(name, fn) {
  if (!configured(name)) return { name, status: 'not_configured', results: [] };
  if (states[name]?.retryAt > Date.now()) return { name, status: states[name].status, results: [] };
  try {
    const results = await fn();
    states[name] = { status: 'available', checkedAt: new Date().toISOString() };
    return { name, status: 'available', results };
  } catch (e) {
    const code = e.response?.status;
    const status = code === 402 ? 'credits_required' : code === 401 || code === 403 ? 'authentication_error' : code === 429 ? 'rate_limited' : 'temporarily_unavailable';
    states[name] = { status, checkedAt: new Date().toISOString(), retryAt: Date.now() + (code === 402 ? 60 * 60 * 1000 : 60000) };
    console.warn(`Price provider ${name}: ${status}`);
    return { name, status, results: [] };
  }
}
async function amazon(query) {
  const { data } = await axios.get('https://api.rainforestapi.com/request', { params: {api_key:process.env.RAINFOREST_API_KEY,type:'search',amazon_domain:'amazon.com',search_term:query}, timeout:10000 });
  if (data.request_info?.success === false) throw new Error('Provider rejected request');
  return (data.search_results || []).slice(0, 15).map(r => ({
    title:r.title, price:r.price?.value, currency:r.price?.currency, source:'Amazon', provider:providers[0],
    externalId:r.asin, url:r.asin ? `https://www.amazon.com/dp/${r.asin}` : r.link, image:r.image,
  }));
}
let ebayToken;
let ebayExpiry = 0;
async function ebay(query) {
  if (Date.now() >= ebayExpiry) {
    const { data } = await axios.post('https://api.ebay.com/identity/v1/oauth2/token', 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope', {
      headers:{'Content-Type':'application/x-www-form-urlencoded'}, auth:{username:process.env.EBAY_CLIENT_ID,password:process.env.EBAY_CLIENT_SECRET}, timeout:8000,
    });
    ebayToken = data.access_token;
    ebayExpiry = Date.now() + (data.expires_in - 60) * 1000;
  }
  const { data } = await axios.get('https://api.ebay.com/buy/browse/v1/item_summary/search', {
    params:{q:query,limit:20},headers:{Authorization:`Bearer ${ebayToken}`,'X-EBAY-C-MARKETPLACE-ID':'EBAY_US'},timeout:10000,
  });
  return (data.itemSummaries || []).filter(r => r.buyingOptions?.includes('FIXED_PRICE')).map(r => ({
    title:r.title,price:r.price?.value,currency:r.price?.currency,source:'eBay',provider:providers[1],
    externalId:r.itemId,url:r.itemWebUrl,image:r.image?.imageUrl,condition:r.condition,
    shipping:r.shippingOptions?.[0]?.shippingCost?.currency === 'USD' ? Number(r.shippingOptions[0].shippingCost.value) : null,
  }));
}
async function shopping(query) {
  const { data } = await axios.get('https://serpapi.com/search', { params:{engine:'google_shopping',q:query,api_key:process.env.SERPAPI_KEY,gl:'us',hl:'en',num:20},timeout:12000 });
  if (data.error) {
    const err = new Error('Provider rejected request');
    if (/credit|quota|limit|plan|run out/i.test(data.error)) err.response = {status:402};
    throw err;
  }
  return (data.shopping_results || []).map(r => {
    // Preserve the actual provider link; never manufacture a merchant search URL for a priced listing.
    const url = safeUrl(r.product_link) || safeUrl(r.link);
    const google = url && /(^|\.)google\.[^/]+$/.test(new URL(url).hostname);
    const currency = typeof r.price === 'string' && /^\$/.test(r.price.trim()) ? 'USD' : null;
    return {title:r.title,price:r.extracted_price,currency,source:r.source,provider:providers[2],externalId:r.product_id,
      url,image:r.thumbnail,description:r.snippet,condition:r.second_hand_condition,
      linkType:google ? 'shopping' : 'listing'};
  });
}
async function search(query) {
  const key = query.toLowerCase().trim().replace(/\s+/g, ' ');
  const cached = cache.get(key);
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < TTL) return {...cached,cached:true};
  if (pending.has(key)) return pending.get(key);
  const task = (async () => {
    const reports = await Promise.all([run(providers[0],()=>amazon(query)),run(providers[1],()=>ebay(query)),run(providers[2],()=>shopping(query))]);
    const fetchedAt = new Date().toISOString();
    const results = [];
    const seen = new Set();
    for (const report of reports) for (const raw of report.results) {
      const item = normalizeListing(raw, query, fetchedAt);
      if (item && !seen.has(item.id)) { results.push(item); seen.add(item.id); }
    }
    const response = {query,fetchedAt,timestamp:fetchedAt,cached:false,results,
      totalSources:new Set(results.map(r=>r.source)).size,
      providers:reports.map(({name,status})=>({name,status})),
      disclosure:'USD listing prices. Shipping, taxes, size, condition and availability may differ. DripTrack does not authenticate products.'};
    // Do not cache empty provider failures for an hour.
    if (results.length) {
      if (cache.size >= 150) cache.delete(cache.keys().next().value);
      cache.set(key,response);
    }
    return response;
  })();
  pending.set(key,task);
  try { return await task; } finally { pending.delete(key); }
}
async function listing(query, id) {
  const data = await search(query);
  const item = data.results.find(r => r.id === id);
  if (!item) return null;
  if (item.provider !== 'eBay' || !item.externalId || !ebayToken) return item;
  try {
    const {data: detail} = await axios.get(`https://api.ebay.com/buy/browse/v1/item/${encodeURIComponent(item.externalId)}`, {
      headers:{Authorization:`Bearer ${ebayToken}`,'X-EBAY-C-MARKETPLACE-ID':'EBAY_US'},timeout:8000,
    });
    const description = String(detail.shortDescription || detail.description || '').replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim().slice(0,1500);
    const facts = (detail.localizedAspects || []).filter(a=> /^(brand|model|style|color|colour|us shoe size|department|type|reference number|case size|material)$/i.test(a.name)).slice(0,10).map(a=>({name:String(a.name).slice(0,80),value:String(a.value).slice(0,200)}));
    return {...item,description:description||item.description,facts};
  } catch { return item; }
}
module.exports = {search,listing,providerStatus};
