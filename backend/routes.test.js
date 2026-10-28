const {test}=require('node:test'),assert=require('node:assert/strict'),jwt=require('jsonwebtoken');
const {harness}=require('./test-support');
async function run(fn,options){const h=await harness(options);try{await fn(h);}finally{await h.close();}}

test('signup and login issue a secure revocable cookie, not a script-readable token',()=>run(async h=>{
  const c=h.client(),{row,login}=await h.user(c);
  assert.equal(login.data.token,undefined);assert.ok(login.data.csrfToken);
  const cookie=login.headers.get('set-cookie');
  for(const flag of ['__Host-driptrack_session=','HttpOnly','Secure','SameSite=Lax','Path=/'])assert.ok(cookie.includes(flag),flag);
  assert.equal(row.sessions.length,1);assert.ok(!cookie.includes(row.sessions[0].hash),'only a hash is stored in the database');
  const me=await c.call('/auth/me');assert.equal(me.status,200);assert.equal(me.data.user.password,undefined);assert.equal(me.data.user.sessions,undefined);assert.equal(me.data.user.verifyToken,undefined);
  const session=await c.call('/auth/session');assert.equal(session.data.authenticated,true);
}));
test('anonymous, forged, expired and legacy bearer sessions cannot access accounts',()=>run(async h=>{
  const c=h.client();assert.equal((await c.call('/auth/me')).status,401);assert.equal((await c.call('/auth/session')).data.authenticated,false);
  const {row}=await h.user(c);const cookie=c.cookie;
  const attacker=h.client();attacker.cookie='__Host-driptrack_session='+'b'.repeat(64);assert.equal((await attacker.call('/auth/me')).status,401);
  const reset=jwt.sign({userId:row._id,purpose:'reset'},'isolated-route-test-secret-32-chars-minimum',{expiresIn:'1h'});
  assert.equal((await attacker.call('/auth/me','GET',undefined,{headers:{Authorization:'Bearer '+reset}})).status,401);
  row.sessions[0].expiresAt=new Date(0);c.cookie=cookie;assert.equal((await c.call('/auth/me')).status,401);
}));
test('CSRF tokens, same-origin checks and non-simple request header are required',()=>run(async h=>{
  const c=h.client();await h.user(c);const csrf=c.csrf;
  for(const headers of [{'X-CSRF-Token':''},{'X-CSRF-Token':'forged'},{Origin:'https://evil.example'},{'Sec-Fetch-Site':'cross-site'},{'X-DripTrack-Request':''}])assert.equal((await c.call('/auth/update-profile','POST',{firstName:'Changed',lastName:'Name'},{headers})).status,403);
  c.csrf=csrf;assert.equal((await c.call('/auth/update-profile','POST',{firstName:'Changed',lastName:'Name'})).status,200);
}));
test('sign out revokes the captured session on the server',()=>run(async h=>{
  const c=h.client();await h.user(c);const captured=c.cookie;assert.equal((await c.call('/auth/logout','POST',{})).status,200);
  c.cookie=captured;assert.equal((await c.call('/auth/me')).status,401);
}));
test('sign out all devices revokes every session',()=>run(async h=>{
  const a=h.client(),{credentials}=await h.user(a),b=h.client();await b.call('/auth/login','POST',credentials);const captured=b.cookie;
  assert.equal((await a.call('/auth/logout-all','POST',{})).status,200);b.cookie=captured;assert.equal((await b.call('/auth/me')).status,401);
}));
test('password change invalidates every session and previously requested reset links',()=>run(async h=>{
  const a=h.client(),{credentials,row}=await h.user(a),b=h.client();await b.call('/auth/login','POST',credentials);const old=b.cookie;
  row.resetToken='previous-reset';
  assert.equal((await a.call('/auth/change-password','POST',{currentPassword:'wrong',newPassword:'Updated-password-5827'})).status,401);
  assert.equal((await a.call('/auth/change-password','POST',{currentPassword:credentials.password,newPassword:'Updated-password-5827'})).status,200);
  b.cookie=old;assert.equal((await b.call('/auth/me')).status,401);assert.equal(row.resetToken,null);
  assert.equal((await b.call('/auth/login','POST',credentials)).status,401);
  assert.equal((await b.call('/auth/login','POST',{email:credentials.email,password:'Updated-password-5827'})).status,200);
}));
test('password reset links are purpose-bound, one-use, and revoke existing sessions',()=>run(async h=>{
  const c=h.client(),{credentials,row}=await h.user(c);const captured=c.cookie;
  await c.call('/auth/forgot-password','POST',{email:credentials.email});
  const html=h.mail.at(-1).html;const token=decodeURIComponent(html.match(/resetpassword\.html\?token=([^"<]+)/)[1]);
  const badPurpose=jwt.sign({userId:row._id,purpose:'verify'},'isolated-route-test-secret-32-chars-minimum',{expiresIn:'1h'});
  assert.equal((await c.call('/auth/reset-password','POST',{token:badPurpose,newPassword:'New-password-5827'})).status,400);
  assert.equal((await c.call('/auth/reset-password','POST',{token,newPassword:'New-password-5827'})).status,200);
  assert.equal((await c.call('/auth/reset-password','POST',{token,newPassword:'Another-password-5827'})).status,400);
  c.cookie=captured;assert.equal((await c.call('/auth/me')).status,401);
}));
test('malformed JSON, huge bodies, arrays, invalid emails and injection objects are rejected',()=>run(async h=>{
  const c=h.client();assert.equal((await c.call('/auth/register','POST',undefined,{raw:'{bad'})).status,400);
  assert.equal((await c.call('/auth/register','POST',[])).status,400);
  assert.equal((await c.call('/auth/register','POST',{padding:'x'.repeat(30000)})).status,413);
  assert.equal((await c.call('/auth/register','POST',undefined,{raw:'name=x',headers:{'Content-Type':'text/plain'}})).status,415);
  for(const patch of [{email:{$ne:null}},{email:'a\r\nb@example.com'},{firstName:'<script>'},{lastName:' '},{password:'x'.repeat(73)},{password:'é'.repeat(40)}])assert.equal((await c.call('/auth/register','POST',{firstName:'Test',lastName:'User',email:'one@example.invalid',password:'Good-password-5827',...patch})).status,400);
}));
test('private files, traversal, invalid query shapes and security headers',()=>run(async h=>{
  const c=h.client();for(const route of ['/backend/server.js','/backend/security.js','/.env','/backend/.env','/.git/config','/package.json','/build-pages.js','/%2e%2e/backend/server.js'])assert.equal((await c.call(route)).status,404,route);
  const root=await c.call('/');assert.ok(root.headers.get('content-security-policy').includes("script-src 'self'"));assert.equal(root.headers.get('x-frame-options'),'DENY');assert.equal(root.headers.get('x-content-type-options'),'nosniff');assert.equal(root.headers.get('x-powered-by'),null);assert.equal(root.headers.get('access-control-allow-origin'),null);
  assert.equal((await c.call('/api/prices?q[]=x')).status,400);assert.deepEqual((await c.call('/api/suggestions?q[]=x')).data.suggestions,[]);
  assert.equal((await c.call('/api/history?listing=../../etc/passwd')).status,400);
}));
test('watchlist uses source values, deduplicates and refreshes without trusting client prices',()=>run(async h=>{
  const c=h.client();await h.user(c);const product=JSON.stringify({...h.listing,price:1,source:'Forged seller',searchQuery:h.listing.title});
  for(let i=0;i<2;i++)assert.equal((await c.call('/auth/watchlist','POST',{product})).status,200);
  const saved=(await c.call('/auth/watchlist')).data.watchlist;assert.equal(saved.length,1);assert.equal(JSON.parse(saved[0]).price,99);assert.equal(JSON.parse(saved[0]).source,'Test fixture');
  h.listing.price=80;const refreshed=await c.call('/auth/watchlist/refresh','POST',{id:h.listing.id});assert.equal(refreshed.status,200);assert.equal(refreshed.data.item.previousPrice,99);assert.equal(refreshed.data.item.price,80);
  assert.equal((await c.call('/auth/watchlist/0junk','DELETE')).status,400);
  assert.equal((await c.call('/auth/watchlist/id/'+h.listing.id,'DELETE')).status,200);
  assert.equal((await c.call('/auth/watchlist')).data.watchlist.length,0);
}));
test('cross-user access cannot read, delete or refresh another account’s listings or alerts',()=>run(async h=>{
  const a=h.client(),b=h.client();await h.user(a,'a@example.invalid');await h.user(b,'b@example.invalid');
  await a.call('/auth/watchlist','POST',{product:JSON.stringify({...h.listing,searchQuery:h.listing.title})});
  await a.call('/auth/alerts','POST',{productName:h.listing.title,targetPrice:80,listingId:h.listing.id,searchQuery:h.listing.title});
  assert.equal((await b.call('/auth/watchlist')).data.watchlist.length,0);
  assert.deepEqual((await b.call('/auth/alerts')).data.alerts,{});
  assert.equal((await b.call('/auth/watchlist/id/'+h.listing.id,'DELETE')).status,404);
  assert.equal((await b.call('/auth/watchlist/refresh','POST',{id:h.listing.id,userId:'1'})).status,404);
  assert.equal((await b.call('/auth/alerts/'+h.listing.id,'PATCH',{targetPrice:1,userId:'1'})).status,404);
  assert.equal((await a.call('/auth/watchlist')).data.watchlist.length,1);
}));
test('alerts require verified email, exact listings and valid targets, and support pause/resume',()=>run(async h=>{
  const c=h.client(),{row}=await h.user(c);const body={productName:h.listing.title,targetPrice:80,listingId:h.listing.id,searchQuery:h.listing.title};
  row.verified=false;assert.equal((await c.call('/auth/alerts','POST',body)).status,403);row.verified=true;
  for(const targetPrice of [-1,0,10000001,null,'garbage'])assert.equal((await c.call('/auth/alerts','POST',{...body,targetPrice})).status,400);
  assert.equal((await c.call('/auth/alerts','POST',{...body,listingId:'b'.repeat(24)})).status,400);
  assert.equal((await c.call('/auth/alerts','POST',body)).status,200);
  assert.equal((await c.call('/auth/alerts/'+h.listing.id,'PATCH',{enabled:false})).status,200);assert.equal(row.priceAlerts[h.listing.id].enabled,false);
  assert.equal((await c.call('/auth/alerts/'+h.listing.id,'PATCH',{enabled:true,targetPrice:75})).status,200);assert.equal(row.priceAlerts[h.listing.id].targetPrice,75);
  assert.equal((await c.call('/auth/alerts/'+h.listing.id,'PATCH',{enabled:'false'})).status,400);
  assert.equal((await c.call('/auth/price-alerts','POST',{alerts:{__proto__:{polluted:true}}})).status,410);
}));
test('account deletion requires explicit confirmation and revokes access',()=>run(async h=>{
  const c=h.client();await h.user(c);assert.equal((await c.call('/auth/account','DELETE')).status,400);const captured=c.cookie;
  assert.equal((await c.call('/auth/account','DELETE',{confirmation:'DELETE'})).status,200);c.cookie=captured;assert.equal((await c.call('/auth/me')).status,401);
}));
test('login abuse is throttled with retry guidance',()=>run(async h=>{
  const c=h.client();for(let i=0;i<8;i++)assert.equal((await c.call('/auth/login','POST',{email:'attempt@example.invalid',password:'wrong'})).status,401);
  const limited=await c.call('/auth/login','POST',{email:'attempt@example.invalid',password:'wrong'});assert.equal(limited.status,429);assert.ok(Number(limited.headers.get('retry-after'))>0);
}));
test('database outage fails closed for accounts but public pages still load',()=>run(async h=>{
  const c=h.client();assert.equal((await c.call('/auth/me')).status,503);assert.equal((await c.call('/')).status,200);
},{database:false}));
test('OAuth rejects missing or forged state before contacting the provider',()=>run(async h=>{
  const c=h.client();const response=await c.call('/auth/google/callback?code=not-real&state=forged');assert.equal(response.status,302);assert.ok(response.headers.get('location').includes('google_state'));
}));
test('push endpoints reject internal destinations and enforce subscription ownership',()=>run(async h=>{
  const a=h.client(),b=h.client(),{row:owner}=await h.user(a,'a@example.invalid');await h.user(b,'b@example.invalid');
  for(const endpoint of ['https://127.0.0.1/private','http://fcm.googleapis.com/send/test','https://fcm.googleapis.com.evil.test/send/test','https://user:pass@fcm.googleapis.com/send/test'])assert.equal((await a.call('/api/push/subscribe','POST',{subscription:{endpoint,keys:{p256dh:'test',auth:'test'}}})).status,400);
  const endpoint='https://fcm.googleapis.com/send/test-subscription';
  await h.stores.get('PushSubscription').Model.create({userId:owner._id,endpoint,keys:{p256dh:'test',auth:'test'}});
  assert.equal((await b.call('/api/push/subscribe','POST',{subscription:{endpoint,keys:{p256dh:'test',auth:'test'}}})).status,409);
  await b.call('/api/push/unsubscribe','DELETE',{endpoint});assert.equal(h.stores.get('PushSubscription').rows.length,1);
}));
test('API search limits bound request volume and expose retry timing',()=>run(async h=>{
  const c=h.client();for(let i=0;i<120;i++)assert.equal((await c.call('/api/prices?q=Test')).status,200);
  const blocked=await c.call('/api/prices?q=Test');assert.equal(blocked.status,429);assert.ok(blocked.headers.get('retry-after'));
}));
test('old sessions cannot delete accounts without fresh sign-in',()=>run(async h=>{
  const c=h.client(),{row}=await h.user(c);row.sessions[0].createdAt=new Date(Date.now()-11*60000);
  assert.equal((await c.call('/auth/account','DELETE',{confirmation:'DELETE'})).status,403);assert.equal(h.stores.get('User').rows.length,1);
}));
test('verification links are consumed once and cannot be reused',()=>run(async h=>{
  const c=h.client(),credentials={firstName:'Email',lastName:'Test',email:'verify@example.invalid',password:'Good-password-7428'};
  await c.call('/auth/register','POST',credentials);const token=decodeURIComponent(h.mail.at(-1).html.match(/auth\/verify\?token=([^"<]+)/)[1]);
  let response=await c.call('/auth/verify?token='+encodeURIComponent(token));assert.equal(response.status,302);assert.ok(response.headers.get('location').includes('verified=true'));
  response=await c.call('/auth/verify?token='+encodeURIComponent(token));assert.ok(response.headers.get('location').includes('invalid_token'));
}));
test('concurrent recovery requests can consume a reset link only once',()=>run(async h=>{
  const c=h.client(),{credentials,row}=await h.user(c);await c.call('/auth/forgot-password','POST',{email:credentials.email});
  const token=decodeURIComponent(h.mail.at(-1).html.match(/resetpassword\.html\?token=([^"<]+)/)[1]);
  assert.notEqual(row.resetToken,token);assert.match(row.resetToken,/^[a-f0-9]{64}$/);
  const responses=await Promise.all([c.call('/auth/reset-password','POST',{token,newPassword:'First-password-7428'}),c.call('/auth/reset-password','POST',{token,newPassword:'Second-password-7428'})]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,400]);
}));
test('concurrent sign-ins retain separate revocable sessions',()=>run(async h=>{
  const a=h.client(),{credentials}=await h.user(a),b=h.client(),c=h.client();
  await Promise.all([b.call('/auth/login','POST',credentials),c.call('/auth/login','POST',credentials)]);
  assert.equal((await b.call('/auth/me')).status,200);assert.equal((await c.call('/auth/me')).status,200);
  const captured=a.cookie;await a.call('/auth/logout','POST',{});a.cookie=captured;
  assert.equal((await a.call('/auth/me')).status,401);assert.equal((await b.call('/auth/me')).status,200);
}));
test('product responses do not wait for stalled database history writes',()=>run(async h=>{
  const response=await h.client().call('/api/prices?q=Nike%20Dunk%20Low%20Panda','GET',undefined,{signal:AbortSignal.timeout(1000)});
  assert.equal(response.status,200);assert.ok(response.data.results.length);
},{slowHistory:true}));
test('versioned public assets are cached while HTML and unversioned files revalidate',()=>run(async h=>{
  const c=h.client(),{assetVersion}=require('./assets');
  const asset=await c.call('/site.css?v='+assetVersion);assert.equal(asset.status,200);assert.ok(asset.headers.get('cache-control').includes('immutable'));assert.ok(!asset.text.includes('@import'));
  const page=await c.call('/');assert.ok(page.text.includes('/site.js?v='+assetVersion));assert.ok(!page.headers.get('cache-control').includes('immutable'));
  const plain=await c.call('/site.js');assert.equal(plain.headers.get('cache-control'),'no-cache');
}));
