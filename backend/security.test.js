const {test}=require('node:test'),assert=require('node:assert/strict');const s=require('./security');const {evaluateAlert}=require('./alerts');
test('session identifiers are random and only SHA-256 hashes enter storage',()=>{
  const tools=s.sessionTools('https://site.example','secret'),cookies=[];const res={cookie:(...v)=>cookies.push(v)};
  const a=tools.issue(res),b=tools.issue(res);assert.notEqual(a.value,b.value);assert.match(a.value,/^[a-f0-9]{64}$/);assert.equal(a.record.hash,s.digest(a.value));assert.notEqual(a.record.hash,a.value);assert.ok(cookies[0][2].httpOnly);assert.ok(cookies[0][2].secure);
});
test('CSRF token is bound to its session and rejects malformed tokens',()=>{
  const tools=s.sessionTools('https://site.example','secret');const token=tools.csrf('one');
  assert.ok(tools.checkCsrf({headers:{'x-csrf-token':token}},'one'));
  for(const candidate of ['',null,[],token+'a'])assert.equal(tools.checkCsrf({headers:{'x-csrf-token':candidate}},'one'),false);
  assert.equal(tools.checkCsrf({headers:{'x-csrf-token':token}},'two'),false);
});
for(const [value,valid]of [['Good-password-7428',true],['short',false],['a'.repeat(72),true],['a'.repeat(73),false],['é'.repeat(36),true],['é'.repeat(37),false],[{},false]])test('password boundary '+JSON.stringify(value).slice(0,35),()=>assert.equal(s.validPassword(value),valid));
test('limiter expires old attempts without resetting on every request',()=>{
  let now=0,allowed=0,status;const headers={};const limiter=s.limiter({max:2,windowMs:1000,key:()=> 'test',now:()=>now});const res={set:(k,v)=>headers[k]=v,status:c=>{status=c;return res;},json:()=>{}};
  limiter({},res,()=>allowed++);limiter({},res,()=>allowed++);limiter({},res,()=>allowed++);assert.equal(allowed,2);assert.equal(status,429);assert.equal(headers['Retry-After'],'1');now=1001;limiter({},res,()=>allowed++);assert.equal(allowed,3);
});
const alert={enabled:true,listingId:'one',targetPrice:80,triggered:false};
for(const [name,patch,items,notify,status]of [
  ['exact target',{},[{id:'one',currency:'USD',price:80}],true,'target_met'],
  ['cheaper different product',{},[{id:'two',currency:'USD',price:10}],false,'listing_not_seen'],
  ['above target',{},[{id:'one',currency:'USD',price:90}],false,'above_target'],
  ['paused',{enabled:false},[{id:'one',currency:'USD',price:60}],false,'paused'],
  ['already delivered',{triggered:true},[{id:'one',currency:'USD',price:60}],false,'target_met'],
  ['foreign currency',{},[{id:'one',currency:'EUR',price:60}],false,'listing_not_seen'],
  ['invalid price',{},[{id:'one',currency:'USD',price:NaN}],false,'listing_not_seen'],
])test('alert logic: '+name,()=>{const evaluation=evaluateAlert({...alert,...patch},items);assert.equal(evaluation.notify,notify);assert.equal(evaluation.status,status);});
test('alert rearms only after observed price rises above the target',()=>assert.equal(evaluateAlert({...alert,triggered:true},[{id:'one',currency:'USD',price:90}]).rearm,true));
