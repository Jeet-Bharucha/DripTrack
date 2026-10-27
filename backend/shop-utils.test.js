const {test}=require('node:test');const assert=require('node:assert/strict');const shop=require('../shop-utils');
const items=[{id:'1',price:50,source:'One',condition:'New with box'},{id:'2',price:75,source:'Two',condition:'Pre-owned'},{id:'3',price:100,source:'Two',condition:null}];
test('combined price, condition and source filters preserve individual listings',()=>{
  assert.deepEqual(shop.filterListings(items,{source:'Two',min:'60',max:'80',condition:'used'}).map(x=>x.id),['2']);
  assert.deepEqual(shop.filterListings(items,{condition:'unknown'}).map(x=>x.id),['3']);
  assert.deepEqual(shop.filterListings(items,{condition:'new'}).map(x=>x.id),['1']);
});
for(const [min,max,expected] of [['','',true],['0','50',true],['100','50',false],['-1','',false],['x','5',false],['Infinity','',false],['1','1',true]])test(`price range ${min}/${max}`,()=>assert.equal(shop.validRange(min,max),expected));
for(const payload of ['=HYPERLINK("https://evil.test")','+cmd','-cmd','@SUM(1)','\t=cmd','  =cmd'])test('CSV neutralizes formula: '+JSON.stringify(payload),()=>assert.ok(shop.csvCell(payload).startsWith('"\'')));
test('CSV correctly escapes quotes and commas',()=>assert.equal(shop.csvCell('a,"b"'),'"a,""b"""'));
test('saved snapshot deltas are calculated from actual observations',()=>{
  assert.deepEqual(shop.priceChange({price:80,previousPrice:100}),{difference:-20,percent:-20});
  assert.equal(shop.priceChange({price:80,previousPrice:null}),null);
});
test('legacy and malformed saved data cannot crash watchlists',()=>{
  for(const raw of ['null','false','[]','"old item"','broken json'])assert.equal(typeof shop.normalizeSaved(raw),'object');
});
test('source titles, descriptions and attribute values are escaped as text',()=>{
  for(const value of ['<img src=x onerror=alert(1)>','"><script>alert(1)</script>',"' onfocus='alert(1)",'&lt;script&gt;']){
    const output=shop.escapeHtml(value);assert.ok(!/[<>"']/.test(output));
  }
});
test('CSV neutralizes control-prefixed formulas',()=>assert.ok(shop.csvCell('\u0000=cmd').startsWith('"\'')));
