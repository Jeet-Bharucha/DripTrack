'use strict';
(() => {
  const $ = selector => document.querySelector(selector);
  const page = document.body.dataset.page;
  const params = new URLSearchParams(location.search);
  let token = localStorage.getItem('driptrack_token');
  const money = n => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function url(value) { try { const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:''; } catch { return ''; } }
  function date(value) { const d=new Date(value);return Number.isNaN(d.getTime())?'Time unavailable':d.toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}); }
  let toastTimer;
  function toast(text) { $('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,5000); }
  function updateNav() { const a=$('#account-link');a.textContent=token?'My account ↗':'Sign in ↗';a.href=token?'/account.html':'/login.html'; }
  function signedOut() { token=null;localStorage.removeItem('driptrack_token');localStorage.removeItem('driptrack_user');updateNav(); }
  async function request(path, options={}) {
    const response = await fetch(path,{...options,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} : {}),...options.headers},signal:options.signal||AbortSignal.timeout(30000)});
    const data=await response.json().catch(()=>({message:'The server returned an unexpected response.'}));
    if (!response.ok) { if(response.status===401 && path!=='/auth/login')signedOut();const error=new Error(data.message||data.error||'Request failed. Please try again.');error.status=response.status;throw error; }
    return data;
  }
  const post=(path,body)=>request(path,{method:'POST',body:JSON.stringify(body)});
  function image(item, detail=false) {
    const src=url(item.image);
    return src?`<img src="${esc(src)}" alt="${esc(item.title)}" ${detail?'':'loading="lazy"'} referrerpolicy="no-referrer"><span class="no-image" hidden>Source image unavailable</span>`:'<span class="no-image">No image supplied by source</span>';
  }
  function handleImages(root) { root.querySelectorAll('img').forEach(img=>{img.addEventListener('error',()=>{img.hidden=true;if(img.nextElementSibling)img.nextElementSibling.hidden=false;},{once:true});}); }
  function detailUrl(item,query) {return `/product.html?id=${encodeURIComponent(item.id)}&q=${encodeURIComponent(query)}`;}
  let listings=[];
  let query='';
  let shown=page==='home'?8:24;
  function card(item,q,index,saved=false) {
    const href=detailUrl(item,q);
    return `<article class="product-card"><div class="product-image"><a href="${esc(href)}" style="display:contents" aria-label="Details for ${esc(item.title)}">${image(item)}</a><button class="save-button" type="button" data-${saved?'remove':'save'}="${index}" aria-label="${saved?'Remove saved listing':'Save listing'}">${saved?'×':'+'}</button></div><div class="card-body"><div class="card-source">${esc(item.source)}</div><h3 class="card-title"><a href="${esc(href)}">${esc(item.title)}</a></h3><div class="card-meta">${item.condition?esc(item.condition):'Condition not supplied'}<br>${esc(item.provider||'Legacy saved item')} · ${item.linkType==='shopping'?'Shopping index':'Seller listing'}</div><div class="card-price">${Number.isFinite(item.price)?money(item.price):'Price unavailable'} <small>USD</small></div><div class="card-bottom"><time datetime="${esc(item.fetchedAt||'')}">Fetched ${esc(date(item.fetchedAt))}</time><a href="${esc(href)}">View details ↗</a></div></div></article>`;
  }
  function empty(root,title,description,action='') {root.innerHTML=`<div class="empty"><h3>${esc(title)}</h3><p>${esc(description)}</p>${action}</div>`;}
  function loading(root) {root.innerHTML=Array.from({length:4},()=>'<article class="product-card skeleton" aria-hidden="true"><div class="product-image"></div><div class="card-body"><div class="loading-line"></div><div class="loading-line" style="width:70%"></div><div class="loading-line" style="width:40%"></div></div></article>').join('');}
  const providerLabels={available:'Responding',not_checked:'Not checked yet',not_configured:'Not connected',credits_required:'Unavailable: credits required',authentication_error:'Unavailable: credentials rejected',rate_limited:'Temporarily rate limited',temporarily_unavailable:'Temporarily unavailable'};
  function notices(data) {
    const unavailable=(data.providers||[]).filter(p=>p.status!=='available');
    $('#provider-notice').innerHTML=unavailable.length?`<div class="notice warning">Limited source coverage: ${unavailable.map(p=>esc(p.name.split(' / ')[0])).join(', ')} ${unavailable.length===1?'is':'are'} temporarily unavailable. Showing results from responding sources. <a class="text-link" href="/about.html#sources">Source details</a></div>`:'';
  }
  function renderResults() {
    const root=$('#results');
    const sort=$('#sort')?.value;
    const condition=$('#condition-filter')?.value||'all';
    let ordered=listings.map((item,index)=>({item,index})).filter(({item})=>condition==='all'||(condition==='unknown'?!item.condition:condition==='new'?/^new\b/i.test(item.condition||''):/pre-owned|used/i.test(item.condition||'')));
    if(sort==='relevance') {
      const sources=new Map();
      for(const entry of ordered){if(!sources.has(entry.item.source))sources.set(entry.item.source,[]);sources.get(entry.item.source).push(entry);}
      ordered=[];
      while([...sources.values()].some(group=>group.length))for(const group of sources.values())if(group.length)ordered.push(group.shift());
    }
    if(sort==='low')ordered.sort((a,b)=>a.item.price-b.item.price);
    if(sort==='high')ordered.sort((a,b)=>b.item.price-a.item.price);
    if(!ordered.length) {empty(root,'No priced listings available.','The sources did not return matching listings with a usable price and product link. Try a more specific model or check again later.');return;}
    root.innerHTML=ordered.slice(0,shown).map(({item,index})=>card(item,query,index)).join('');handleImages(root);
    if($('#show-more'))$('#show-more').hidden=ordered.length<=shown;
  }
  let searchVersion=0;
  async function search(q) {
    const root=$('#results');const version=++searchVersion;
    query=q;listings=[];shown=page==='home'?8:24;root.setAttribute('aria-busy','true');loading(root);$('#result-status').textContent='Fetching sourced listings…';$('#provider-notice').innerHTML='';
    if($('#query'))$('#query').value=q;
    if($('#search-title'))$('#search-title').textContent=q;
    if($('#search-subtitle'))$('#search-subtitle').textContent='Individual listings, with original titles. Check size and condition before comparing prices.';
    try {
      const data=await request(`/api/prices?q=${encodeURIComponent(q)}`);
      if(version!==searchVersion)return;
      listings=(data.results||[]).filter(r=>r.id&&r.title&&url(r.url)&&r.currency==='USD'&&Number.isFinite(r.price));
      notices(data);renderResults();
      $('#result-status').textContent=`${listings.length} listings · ${data.totalSources||0} sources · ${data.cached?'Cached · ':''}Fetched ${date(data.fetchedAt)}`;
    } catch(e) {
      if(version!==searchVersion)return;
      empty(root,'We couldn’t fetch listings.',e.message||'Please try again.');$('#result-status').textContent='Search unavailable';
    } finally {if(version===searchVersion)root.setAttribute('aria-busy','false');}
  }
  document.querySelectorAll('[data-search]').forEach(form=>form.addEventListener('submit',e=>{
    e.preventDefault();const q=new FormData(form).get('q').trim();if(q.length<2)return;
    if(page==='browse'){history.replaceState(null,'',`/app?q=${encodeURIComponent(q)}`);search(q);}else location.href=`/app?q=${encodeURIComponent(q)}`;
  }));
  $('#sort')?.addEventListener('change',renderResults);
  $('#condition-filter')?.addEventListener('change',()=>{shown=page==='home'?8:24;renderResults();});
  $('#show-more')?.addEventListener('click',()=>{shown+=24;renderResults();});
  async function save(item,q) {
    if(!token){location.href='/login.html';return;}
    try{await post('/auth/watchlist',{product:JSON.stringify({...item,searchQuery:q})});toast('Saved to your shortlist.');}catch(e){toast(e.message);}
  }
  $('#results')?.addEventListener('click',async e=>{const button=e.target.closest('[data-save]');if(!button)return;button.disabled=true;await save(listings[Number(button.dataset.save)],query);button.disabled=false;});
  async function product() {
    const root=$('#product-detail'),q=params.get('q'),id=params.get('id');
    if(!q||!id){empty(root,'Choose a listing first.','Open a result from Explore to see source-backed product information.','<a class="button" href="/app">Explore listings →</a>');return;}
    $('#back-search').href=`/app?q=${encodeURIComponent(q)}`;
    try{
      const data=await request(`/api/listing?q=${encodeURIComponent(q)}&id=${encodeURIComponent(id)}`);
      const item=data.item;
      if(!item){empty(root,'This listing is no longer in the results.','We could not retrieve this exact listing. We won’t substitute another product or a made-up price.',`<a class="button" href="/app?q=${encodeURIComponent(q)}">Search again →</a>`);return;}
      const href=url(item.url);document.title=`${item.title} — DripTrack`;
      root.innerHTML=`<div class="detail"><div class="detail-image">${image(item,true)}</div><div><div class="eyebrow">${esc(item.source)} · ${item.linkType==='shopping'?'Shopping index':'Seller listing'}</div><h1>${esc(item.title)}</h1><div class="detail-price">${money(item.price)}</div><div class="fine">USD · Source-reported price. Final total may differ.</div><dl class="details-list"><dt>Retailer / marketplace</dt><dd>${esc(item.source)}</dd><dt>Data provider</dt><dd>${esc(item.provider)}</dd><dt>Fetched</dt><dd>${esc(date(item.fetchedAt))}${data.cached?' · Cached search':''}</dd><dt>Condition</dt><dd>${esc(item.condition||'Not supplied by source')}</dd><dt>Shipping</dt><dd>${item.shipping===null?'Not supplied · check seller':money(item.shipping)}</dd><dt>Authenticity</dt><dd>Not independently verified by DripTrack</dd></dl><div class="actions"><a class="button lime" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${item.linkType==='shopping'?'Open shopping result':'Open seller listing'} ↗</a><button class="button ghost" id="save-detail">Save listing +</button></div><p class="fine">Check size, colorway, seller, availability and returns before buying. The link opens a third-party website.</p></div></div><div class="two-col"><section class="panel"><h2>Source description & details</h2><blockquote class="source-description">${esc(item.description||'The provider did not supply a product description. Visit the original listing for materials, sizing, specifications and seller details.')}</blockquote>${item.description?'<p class="fine">Seller-supplied text. Claims in this description have not been independently verified by DripTrack.</p>':''}${item.facts?.length?`<dl class="details-list">${item.facts.map(f=>`<dt>${esc(f.name)}</dt><dd>${esc(f.value)}</dd>`).join('')}</dl>`:''}<p class="fine">Title and image supplied by ${esc(item.provider)}. Images belong to their respective owners.</p></section><section class="panel"><h2>Follow this exact listing</h2><p class="fine">Alert checks run approximately every 30 minutes while the server is awake. Provider outages or listing changes can delay or prevent matches.</p><form id="alert-form"><div class="field"><label for="target-price">Target price (USD)</label><input id="target-price" name="target" type="number" min="0.01" step="0.01" max="10000000" placeholder="${item.price.toFixed(2)}" required></div><button class="button" type="submit">Create price alert</button><p id="alert-message" class="form-message" role="status"></p></form></section></div><section class="section"><div class="section-head"><div><div class="eyebrow">Observed, never estimated</div><h2>Listing price history</h2><p>Only observations for this exact source listing. No synthetic charts.</p></div></div><div class="panel" id="listing-history">Loading observations…</div></section>`;
      handleImages(root);$('#save-detail').addEventListener('click',()=>save(item,q));
      $('#alert-form').addEventListener('submit',async e=>{e.preventDefault();if(!token){location.href='/login.html';return;}const b=e.target.querySelector('button');b.disabled=true;try{await post('/auth/alerts',{productName:item.title,targetPrice:Number($('#target-price').value),productImage:item.image,listingId:item.id,searchQuery:q});$('#alert-message').textContent='Alert saved. Manage it from your account.';$('#alert-message').classList.add('success');}catch(err){$('#alert-message').textContent=err.message;}finally{b.disabled=false;}});
      try{const historyData=await request(`/api/history?listing=${encodeURIComponent(id)}`);const rows=historyData.history||[];
        if(rows.length<2){$('#listing-history').innerHTML=`<p class="fine">${rows.length?'One price observation recorded.':'No observations recorded yet.'} More observations are needed to show a trend. A new observation is recorded after a fresh provider fetch, not every page refresh.</p>`;}
        else{$('#listing-history').innerHTML=`<div class="table-wrap"><table><caption class="fine">${rows.length} source-reported observations · USD</caption><thead><tr><th scope="col">Fetched</th><th scope="col">Source</th><th scope="col">Price</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(date(r.timestamp))}</td><td>${esc(r.source)}</td><td>${money(r.price)}</td></tr>`).join('')}</tbody></table></div>`;}
      }catch{$('#listing-history').textContent='History is temporarily unavailable. No estimated data is shown.';}
    }catch(e){empty(root,'Listing details are unavailable.',e.message);}
  }
  let saved=[];
  async function watchlist() {
    const root=$('#saved-results');
    if(!token){empty(root,'A home for your next finds.','Sign in to save listings to your account and revisit them across devices.','<a class="button" href="/login.html">Sign in →</a>');return;}
    loading(root);
    try{const data=await request('/auth/watchlist');saved=(data.watchlist||[]).map((raw,index)=>{let item;try{item=JSON.parse(raw);}catch{item={title:raw};}return {item,index};});
      $('#saved-status').textContent=`${saved.length} saved listings · prices are saved snapshots`;
      if(!saved.length){empty(root,'Nothing saved. Yet.','Tap the + on any listing to start your shortlist.','<a class="button" href="/app">Find something good →</a>');return;}
      root.innerHTML=saved.map(({item,index})=>item.id?card(item,item.searchQuery||item.title,index,true):`<article class="panel"><h3>${esc(item.title||item.name||'Previously saved product')}</h3><p class="fine">This older saved item has no source provenance. Search again to save a current listing.</p><a class="text-link" href="/app?q=${encodeURIComponent(item.title||item.name||'')}">Find current listings ↗</a><button class="button ghost" data-remove="${index}" style="margin-top:20px">Remove</button></article>`).join('');handleImages(root);
    }catch(e){empty(root,'We couldn’t load your shortlist.',e.message);}
  }
  $('#saved-results')?.addEventListener('click',async e=>{const b=e.target.closest('[data-remove]');if(!b)return;b.disabled=true;try{await request(`/auth/watchlist/${Number(b.dataset.remove)}`,{method:'DELETE'});await watchlist();}catch(err){toast(err.message);b.disabled=false;}});
  function message(text,success=false) {$('#form-message').textContent=text;$('#form-message').classList.toggle('success',success);}
  async function submitForm(form,fn){const button=form.querySelector('button[type=submit]');button.disabled=true;message('');try{await fn(new FormData(form));}catch(e){message(e.message);}finally{button.disabled=false;}}
  $('#login-form')?.addEventListener('submit',e=>{e.preventDefault();submitForm(e.target,async f=>{const d=await post('/auth/login',{email:f.get('email'),password:f.get('password')});token=d.token;localStorage.setItem('driptrack_token',token);localStorage.setItem('driptrack_user',JSON.stringify(d.user));location.href='/watchlist.html';});});
  $('#register-form')?.addEventListener('submit',e=>{e.preventDefault();submitForm(e.target,async f=>{const d=await post('/auth/register',Object.fromEntries(f));message(d.emailSent?'Account created. Check your inbox for a verification link. You can now sign in.':'Account created. Verification email is currently unavailable. You can sign in with your password.',true);e.target.reset();});});
  $('#forgot-password')?.addEventListener('click',async e=>{const email=$('#email');if(!email.value||!email.checkValidity()){email.reportValidity();return;}e.target.disabled=true;try{const d=await post('/auth/forgot-password',{email:email.value});message(d.message,true);}catch(err){message(err.message);}finally{e.target.disabled=false;}});
  $('#reset-form')?.addEventListener('submit',e=>{e.preventDefault();submitForm(e.target,async f=>{if(!params.get('token'))throw new Error('This reset link has no token. Request a new link from the sign-in page.');if(f.get('newPassword')!==f.get('confirmPassword'))throw new Error('The passwords do not match.');await post('/auth/reset-password',{token:params.get('token'),newPassword:f.get('newPassword')});message('Password updated. You can now sign in.',true);e.target.reset();});});
  async function account() {
    const root=$('#account-content');if(!token){empty(root,'Sign in to your account.','Manage your profile, saved listings and price alerts.','<a class="button" href="/login.html">Sign in →</a>');return;}
    try{const d=await request('/auth/me');const u=d.user||d;
      root.innerHTML=`<div class="two-col"><section class="panel"><h2>Your profile</h2><form id="profile-form"><div class="field"><label for="firstName">First name</label><input id="firstName" name="firstName" value="${esc(u.firstName)}" maxlength="60" required></div><div class="field"><label for="lastName">Last name</label><input id="lastName" name="lastName" value="${esc(u.lastName)}" maxlength="60" required></div><p class="fine">${esc(u.email)} · ${u.verified?'Email verified':'Email not verified'}</p><button class="button" type="submit">Save profile</button></form><div class="actions"><a class="button ghost" href="/watchlist.html">Your shortlist ↗</a><button class="button ghost" id="logout">Sign out</button></div></section><section class="panel"><h2>Change password</h2><form id="change-password-form"><div class="field"><label for="currentPassword">Current password</label><input id="currentPassword" name="currentPassword" type="password" autocomplete="current-password" required></div><div class="field"><label for="accountNewPassword">New password</label><input id="accountNewPassword" name="newPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></div><button class="button" type="submit">Update password</button></form><p class="fine">Signed up with Google? Use the password reset option on the sign-in page to set a password.</p></section></div><section class="section"><div class="section-head"><div><h2>Your price alerts</h2><p>Alerts follow an exact listing, not the lowest price of a different product.</p></div></div><div class="panel" id="account-alerts">Loading alerts…</div></section><section class="panel"><h2>Delete your account</h2><p class="fine">Permanently remove your profile, saved listings, alerts and push subscriptions. This cannot be undone.</p><button class="button ghost" id="delete-account">Delete account</button><div id="delete-confirm" hidden><p class="fine">Confirm that you want to permanently delete your account.</p><button class="button" id="delete-final">Yes, permanently delete my account</button> <button class="button ghost" id="delete-cancel">Cancel</button></div></section>`;
      $('#logout').onclick=()=>{signedOut();location.href='/';};
      $('#profile-form').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;try{await post('/auth/update-profile',Object.fromEntries(new FormData(e.target)));toast('Profile updated.');}catch(err){toast(err.message);}finally{b.disabled=false;}};
      $('#change-password-form').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;try{await post('/auth/change-password',Object.fromEntries(new FormData(e.target)));e.target.reset();toast('Password updated.');}catch(err){toast(err.message);}finally{b.disabled=false;}};
      $('#delete-account').onclick=()=>{$('#delete-confirm').hidden=false;$('#delete-final').focus();};$('#delete-cancel').onclick=()=>{$('#delete-confirm').hidden=true;$('#delete-account').focus();};
      $('#delete-final').onclick=async e=>{e.target.disabled=true;try{await request('/auth/account',{method:'DELETE'});signedOut();location.href='/';}catch(err){toast(err.message);e.target.disabled=false;}};
      await loadAlerts();
    }catch(e){empty(root,'Account unavailable.',e.message);}
  }
  async function loadAlerts(){const root=$('#account-alerts');try{const data=await request('/auth/alerts');const entries=Object.entries(data.alerts||{});if(!entries.length){root.innerHTML='<p class="fine">No alerts yet. Open a listing and set your target price.</p>';return;}root.innerHTML=entries.map(([key,a])=>`<div class="alert-item"><div><strong>${esc(a.productName)}</strong><small>Target ${money(Number(a.targetPrice))} · ${a.listingId?'Exact listing alert':'Legacy alert paused—recreate from a current listing'}</small></div><button data-delete-alert="${esc(key)}">Remove</button></div>`).join('');root.onclick=async e=>{const b=e.target.closest('[data-delete-alert]');if(!b)return;b.disabled=true;try{await request(`/auth/alerts/${encodeURIComponent(b.dataset.deleteAlert)}`,{method:'DELETE'});await loadAlerts();}catch(err){toast(err.message);b.disabled=false;}};}catch(e){root.textContent=e.message;}}
  async function status(){try{const d=await request('/api/status');if($('#google-signin'))$('#google-signin').hidden=!d.googleLogin;if($('#source-status'))$('#source-status').innerHTML=(d.providers||[]).map(p=>`<span class="source-pill">${esc(p.name)}<small>${esc(providerLabels[p.status]||p.status)}</small></span>`).join('');}catch{if($('#source-status'))$('#source-status').textContent='Provider status is temporarily unavailable.';}}
  // The old service worker cached pages containing synthetic product data.
  // Unregister it and remove only DripTrack caches so obsolete screens cannot reappear offline.
  if('serviceWorker' in navigator)navigator.serviceWorker.getRegistrations().then(registrations=>Promise.all(registrations.filter(r=>r.scope===location.origin+'/').map(r=>r.unregister()))).catch(()=>{});
  if('caches' in window)caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('driptrack-')).map(k=>caches.delete(k)))).catch(()=>{});
  updateNav();
  if(page==='home')search('Nike Dunk Low Panda');
  if(page==='browse'){if(params.get('q'))search(params.get('q'));else{$('#results').setAttribute('aria-busy','false');$('#result-status').textContent='No search yet';empty($('#results'),'Your next find starts with a search.','Try a full model name or reference number for more relevant results.');}}
  if(page==='product')product();if(page==='watchlist')watchlist();if(page==='account')account();
  if(page==='login'){
    const hash=new URLSearchParams(location.hash.slice(1));const oauthToken=hash.get('token');
    if(oauthToken){localStorage.setItem('driptrack_token',oauthToken);history.replaceState(null,'','/login.html');location.href='/watchlist.html';}
    if(params.get('verified'))message('Email verified. You can now sign in.',true);
    if(params.get('error'))message('Sign-in could not be completed. Try email and password or start Google sign-in again.');
    status();
  }
  if(page==='about')status();
})();
