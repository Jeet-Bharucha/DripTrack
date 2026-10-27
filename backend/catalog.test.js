const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeListing, relevant, safeUrl } = require('./catalog');
const base = { title: 'Nike Dunk Low Panda', price: 99, currency: 'USD', source: 'Store', provider: 'SerpAPI', url: 'https://example.com/product/1' };
test('reject unrelated products and invalid or foreign prices', () => {
  assert.equal(relevant('Nike shoelaces', 'Nike Dunk Low Panda'), false);
  for (const patch of [{price:0},{price:NaN},{currency:'EUR'},{url:'javascript:alert(1)'},{title:'Nike Dunk Low Panda replica'}]) {
    assert.equal(normalizeListing({...base,...patch}, 'Nike Dunk Low Panda', '2026-10-27T00:00:00Z'), null);
  }
});
test('preserve source facts without invented authenticity, description, or image', () => {
  const item = normalizeListing(base, 'Nike Dunk Low Panda', '2026-10-27T00:00:00Z');
  assert.equal(item.authenticity, 'not_independently_verified');
  assert.equal(item.description, null);
  assert.equal(item.image, null);
  assert.equal(item.fetchedAt, '2026-10-27T00:00:00Z');
  assert.notEqual(item.id, normalizeListing({...base,url:'https://example.com/product/2'}, 'Nike Dunk Low Panda', item.fetchedAt).id);
});
test('reject unsafe external URLs and preserve relevant model numbers', () => {
  assert.equal(safeUrl('https://user:password@example.com'), null);
  assert.equal(safeUrl('http://example.com'), null);
  assert.equal(relevant('New Balance 550 White Green', 'New Balance 550'), true);
  assert.equal(relevant('New Balance 574', 'New Balance 550'), false);
});
