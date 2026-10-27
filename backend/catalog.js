const crypto = require('crypto');

function safeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function relevant(title, query) {
  const words = value => String(value || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').split(' ').filter(Boolean);
  const ignored = new Set(['the', 'and', 'for', 'with', 'new', 'mens', 'men', 'womens', 'women']);
  const terms = words(query).filter(w => !ignored.has(w));
  const tokens = words(title);
  const matched = terms.filter(w => tokens.some(t => t === w || (w.length > 3 && t === w + 's'))).length;
  const numbers = terms.filter(w => /\d/.test(w));
  if (numbers.some(w => !tokens.includes(w))) return false;
  return terms.length > 0 && matched >= Math.ceil(terms.length * 0.85);
}

function normalizeListing(raw, query, fetchedAt) {
  const title = typeof raw.title === 'string' ? raw.title.trim().slice(0, 500) : '';
  const price = Number(raw.price);
  const url = safeUrl(raw.url);
  if (!title || !url || !Number.isFinite(price) || price <= 0 || !relevant(title, query)) return null;
  if (/\b(replica|counterfeit|inspired by|empty box|box only|replacement part)\b/i.test(title)) return null;
  const currency = String(raw.currency || '').toUpperCase();
  if (currency !== 'USD') return null;
  const source = String(raw.source || 'Retailer').slice(0, 100);
  const id = crypto.createHash('sha256').update(`${raw.provider}|${source}|${raw.externalId || url}|${title}`).digest('hex').slice(0, 24);
  return {
    id, title, price, currency, url, source,
    externalId: raw.externalId || null,
    image: safeUrl(raw.image), provider: raw.provider,
    linkType: raw.linkType || 'listing',
    condition: typeof raw.condition === 'string' ? raw.condition.slice(0, 100) : null,
    description: typeof raw.description === 'string' ? raw.description.slice(0, 1500) : null,
    fetchedAt, authenticity: 'not_independently_verified',
    shipping: Number.isFinite(raw.shipping) ? raw.shipping : null,
  };
}

module.exports = { safeUrl, relevant, normalizeListing };
