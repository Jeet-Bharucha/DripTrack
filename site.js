'use strict';
(() => {
  const $ = selector => document.querySelector(selector);
  const page = document.body.dataset.page;
  // Render immediately with system fonts; fetch brand fonts after the first paint.
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    const fonts=document.createElement('link');fonts.rel='stylesheet';
    fonts.href='https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap';
    document.head.append(fonts);
  }));
  const params = new URLSearchParams(location.search);
  let authenticated=false,csrfToken='';
  try{localStorage.removeItem('driptrack_token');localStorage.removeItem('driptrack_user');}catch{}
  const shop=window.DripShop;
  const money = n => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);
  const esc = shop.escapeHtml;
  function url(value) { try { const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:''; } catch { return ''; } }
  function date(value) { const d=new Date(value);return Number.isNaN(d.getTime())?'Time unavailable':d.toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}); }
  let toastTimer;
  function toast(text) { $('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,5000); }
  function updateNav() { const a=$('#account-link');a.textContent=authenticated?'My account ↗':'Sign in ↗';a.href=authenticated?'/account.html':'/login.html'; }
  function signedOut() { authenticated=false;csrfToken='';updateNav(); }
  async function request(path, options={}) {
    const response = await fetch(path,{...options,headers:{'Content-Type':'application/json','X-DripTrack-Request':'1',...(csrfToken?{'X-CSRF-Token':csrfToken}:{}),...options.headers},signal:options.signal||AbortSignal.timeout(30000)});
    const data=await response.json().catch(()=>({message:'The server returned an unexpected response.'}));
    if (!response.ok) { if(response.status===401 && path!=='/auth/login')signedOut();const error=new Error(data.message||data.error||'Request failed. Please try again.');error.status=response.status;throw error; }
    if(data.csrfToken)csrfToken=data.csrfToken;
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
  let requestedSource=params.get('source')||'';
  let shown=page==='home'?8:24;
  let comparison=[];
  try{comparison=JSON.parse(sessionStorage.getItem('driptrack_compare')||'[]').filter(i=>i&&typeof i.title==='string'&&/^[a-f0-9]{24}$/.test(i.id)&&url(i.url)&&Number.isFinite(i.price)).slice(0,3);}catch{}
  function compareState(){
    try{sessionStorage.setItem('driptrack_compare',JSON.stringify(comparison));}catch{}
    $('#compare-dock').hidden=!comparison.length;$('#compare-count').textContent=`${comparison.length} of 3 selected`;
    $('#open-compare').disabled=comparison.length<2;document.body.classList.toggle('has-comparison',!!comparison.length);
    document.querySelectorAll('[data-compare]').forEach(b=>{const on=comparison.some(i=>i.id===b.dataset.compare);b.setAttribute('aria-pressed',String(on));b.textContent=on?'Selected ✓':'Compare';});
  }
  function toggleCompare(item,q){
    if(!item)return;
    const index=comparison.findIndex(i=>i.id===item.id);
    if(index>=0)comparison.splice(index,1);else if(comparison.length>=3){toast('Choose up to 3 listings. Clear a selection to add another.');return;}else comparison.push({...item,searchQuery:q});
    compareState();
  }
  $('#clear-compare').onclick=()=>{comparison=[];compareState();};
  $('#close-compare').onclick=()=>$('#compare-dialog').close();
  $('#open-compare').onclick=()=>{
    const rows=[['Listing',i=>esc(i.title)],['Price (USD)',i=>money(i.price)],['Condition',i=>esc(i.condition||'Not supplied')],['Retailer',i=>esc(i.source)],['Shipping',i=>Number.isFinite(i.shipping)?money(i.shipping):'Check seller'],['Fetched',i=>esc(date(i.fetchedAt))],['Source',i=>`<a class="text-link" target="_blank" rel="noopener noreferrer" href="${esc(url(i.url))}">Open original ↗</a>`]];
    $('#comparison-table').innerHTML=`<table class="compare-table"><caption class="fine">Source-reported snapshots, not guaranteed checkout totals.</caption><thead><tr><th scope="col">Details</th>${comparison.map((_,n)=>`<th scope="col">Listing ${n+1}</th>`).join('')}</tr></thead><tbody>${rows.map(([label,value])=>`<tr><th scope="row">${label}</th>${comparison.map(i=>`<td>${value(i)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    $('#compare-dialog').showModal();
  };
  compareState();
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
    const filters=currentFilters();
    if(!shop.validRange(filters.min,filters.max)){$('#filter-status').textContent='Enter a valid price range. Minimum must not exceed maximum.';return;}
    $('#filter-status').textContent='';
    const matching=new Set(shop.filterListings(listings,filters).map(i=>i.id));
    let ordered=listings.map((item,index)=>({item,index})).filter(({item})=>matching.has(item.id));
    if(sort==='relevance') {
      const sources=new Map();
      for(const entry of ordered){if(!sources.has(entry.item.source))sources.set(entry.item.source,[]);sources.get(entry.item.source).push(entry);}
      ordered=[];
      while([...sources.values()].some(group=>group.length))for(const group of sources.values())if(group.length)ordered.push(group.shift());
    }
    if(sort==='low')ordered.sort((a,b)=>a.item.price-b.item.price);
    if(sort==='high')ordered.sort((a,b)=>b.item.price-a.item.price);
    if(!ordered.length) {if($('#show-more'))$('#show-more').hidden=true;empty(root,listings.length?'No listings match these filters.':'No priced listings available.',listings.length?'Try widening your price range or clearing a filter.':'The sources did not return matching listings with a usable price and product link. Try a more specific model or check again later.');return;}
    root.innerHTML=ordered.slice(0,shown).map(({item,index})=>card(item,query,index)).join('');handleImages(root);
    root.querySelectorAll('.card-body').forEach(body=>{const link=body.querySelector('.card-title a');const id=new URL(link.href).searchParams.get('id');body.insertAdjacentHTML('beforeend',`<button type="button" class="compare-toggle" data-compare="${esc(id)}" aria-pressed="false">Compare</button>`);});
    compareState();
    $('#filter-status').textContent=`Showing ${Math.min(shown,ordered.length)} of ${ordered.length} matching listings.`;
    syncSearchUrl();
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
      const selected=$('#source-filter').value||requestedSource;requestedSource='';
      $('#source-filter').innerHTML='<option value="">All retailers</option>'+[...new Set(listings.map(i=>i.source))].sort().map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('');
      $('#source-filter').value=[...$('#source-filter').options].some(o=>o.value===selected)?selected:'';
      notices(data);renderResults();
      rememberSearch(q);
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
  function currentFilters(){return {condition:$('#condition-filter')?.value||'all',source:$('#source-filter')?.value||'',min:$('#min-price')?.value||'',max:$('#max-price')?.value||''};}
  function syncSearchUrl(){if(page!=='browse'||!query)return;const values=new URLSearchParams({q:query});for(const [k,v]of Object.entries(currentFilters()))if(v&&v!=='all')values.set(k,v);if($('#sort').value!=='relevance')values.set('sort',$('#sort').value);history.replaceState(null,'','/app?'+values);}
  for(const id of ['source-filter','min-price','max-price'])$('#'+id)?.addEventListener('input',()=>{shown=page==='home'?8:24;renderResults();});
  $('#clear-filters')?.addEventListener('click',()=>{for(const id of ['source-filter','min-price','max-price'])$('#'+id).value='';$('#condition-filter').value='all';$('#sort').value='relevance';renderResults();});
  $('#share-search')?.addEventListener('click',async()=>{try{syncSearchUrl();const values=new URLSearchParams({q:query});for(const[k,v]of Object.entries(currentFilters()))if(v&&v!=='all')values.set(k,v);if($('#sort').value!=='relevance')values.set('sort',$('#sort').value);await navigator.clipboard.writeText(location.origin+'/app?'+values);toast('Search link copied.');}catch{toast('Copy the search URL from your address bar.');}});
  function rememberSearch(q){
    let recent=[];try{recent=JSON.parse(sessionStorage.getItem('driptrack_recent')||'[]');if(!Array.isArray(recent))recent=[];recent=[q,...recent.filter(s=>typeof s==='string'&&s!==q&&s.length<=120)].slice(0,5);sessionStorage.setItem('driptrack_recent',JSON.stringify(recent));}catch{}
    if($('#recent-searches'))$('#recent-searches').innerHTML='<span class="fine">Recent in this tab</span><div class="chips">'+recent.map(s=>`<a class="chip" href="/app?q=${encodeURIComponent(s)}">${esc(s)}</a>`).join('')+'</div>';
  }
  async function save(item,q) {
    await sessionReady;
    if(!authenticated){location.href='/login.html';return;}
    try{await post('/auth/watchlist',{product:JSON.stringify({...item,searchQuery:q})});toast('Saved to your shortlist.');}catch(e){toast(e.message);}
  }
  $('#results')?.addEventListener('click',async e=>{const button=e.target.closest('[data-save]');if(!button)return;button.disabled=true;await save(listings[Number(button.dataset.save)],query);button.disabled=false;});
  $('#results')?.addEventListener('click',e=>{const b=e.target.closest('[data-compare]');if(b)toggleCompare(listings.find(i=>i.id===b.dataset.compare),query);});
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
      $('#alert-form').addEventListener('submit',async e=>{e.preventDefault();await sessionReady;if(!authenticated){location.href='/login.html';return;}const b=e.target.querySelector('button');b.disabled=true;try{await post('/auth/alerts',{productName:item.title,targetPrice:Number($('#target-price').value),productImage:item.image,listingId:item.id,searchQuery:q});$('#alert-message').textContent='Alert saved. Manage it from your account.';$('#alert-message').classList.add('success');}catch(err){$('#alert-message').classList.remove('success');$('#alert-message').textContent=err.message;}finally{b.disabled=false;}});
      try{const historyData=await request(`/api/history?listing=${encodeURIComponent(id)}`);const rows=historyData.history||[];
        if(rows.length<2){$('#listing-history').innerHTML=`<p class="fine">${rows.length?'One price observation recorded.':'No observations recorded yet.'} More observations are needed to show a trend. A new observation is recorded after a fresh provider fetch, not every page refresh.</p>`;}
        else{$('#listing-history').innerHTML=`<div class="table-wrap"><table><caption class="fine">${rows.length} source-reported observations · USD</caption><thead><tr><th scope="col">Fetched</th><th scope="col">Source</th><th scope="col">Price</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(date(r.timestamp))}</td><td>${esc(r.source)}</td><td>${money(r.price)}</td></tr>`).join('')}</tbody></table></div>`;}
      }catch{$('#listing-history').textContent='History is temporarily unavailable. No estimated data is shown.';}
    }catch(e){empty(root,'Listing details are unavailable.',e.message);}
  }
  let saved=[];
  async function watchlist() {
    const root=$('#saved-results');
    if(!authenticated){empty(root,'A home for your next finds.','Sign in to save listings to your account and revisit them across devices.','<a class="button" href="/login.html">Sign in →</a>');return;}
    loading(root);
    try{const data=await request('/auth/watchlist');saved=(data.watchlist||[]).map((raw,index)=>({item:shop.normalizeSaved(raw),index}));
      $('#saved-status').textContent=`${saved.length} saved listings · prices are saved snapshots`;
      if(!saved.length){empty(root,'Nothing saved. Yet.','Tap the + on any listing to start your shortlist.','<a class="button" href="/app">Find something good →</a>');return;}
      root.innerHTML=saved.map(({item,index})=>item.id?card(item,item.searchQuery||item.title,index,true):`<article class="panel"><h3>${esc(item.title||item.name||'Previously saved product')}</h3><p class="fine">This older saved item has no source provenance. Search again to save a current listing.</p><a class="text-link" href="/app?q=${encodeURIComponent(item.title||item.name||'')}">Find current listings ↗</a><button class="button ghost" data-remove="${index}" style="margin-top:20px">Remove</button></article>`).join('');handleImages(root);
      $('#export-watchlist').hidden=false;
      root.querySelectorAll('.product-card').forEach((article,n)=>{const entry=saved.filter(s=>s.item.id)[n],item=entry.item;const change=shop.priceChange(item);article.querySelector('.card-body').insertAdjacentHTML('beforeend',`${change?`<p class="fine">${change.difference===0?'Same saved price':`${change.difference<0?'Down':'Up'} ${money(Math.abs(change.difference))}`} since ${esc(date(item.previousFetchedAt))}</p>`:''}<div class="saved-tools"><button class="compare-toggle" data-refresh="${esc(item.id)}">Refresh snapshot</button><button class="compare-toggle" data-compare="${esc(item.id)}" aria-pressed="false">Compare</button></div>`);});compareState();
    }catch(e){empty(root,'We couldn’t load your shortlist.',e.message);}
  }
  $('#saved-results')?.addEventListener('click',async e=>{
    const compare=e.target.closest('[data-compare]');if(compare){const entry=saved.find(s=>s.item.id===compare.dataset.compare);toggleCompare(entry?.item,entry?.item.searchQuery);return;}
    const refresh=e.target.closest('[data-refresh]');if(refresh){refresh.disabled=true;refresh.textContent='Refreshing…';try{const d=await post('/auth/watchlist/refresh',{id:refresh.dataset.refresh});await watchlist();toast(d.cached?'Snapshot checked against the cached source results.':'Snapshot updated from source results.');}catch(err){toast(err.message);refresh.disabled=false;refresh.textContent='Refresh snapshot';}return;}
    const b=e.target.closest('[data-remove]');if(!b)return;b.disabled=true;const entry=saved.find(s=>s.index===Number(b.dataset.remove));try{await request(entry?.item.id?`/auth/watchlist/id/${entry.item.id}`:`/auth/watchlist/${Number(b.dataset.remove)}`,{method:'DELETE'});await watchlist();}catch(err){toast(err.message);b.disabled=false;}
  });
  $('#export-watchlist')?.addEventListener('click',()=>{const csv=shop.watchlistCsv(saved.map(s=>s.item));const objectUrl=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=objectUrl;a.download='driptrack-shortlist.csv';a.click();setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);});
  function message(text,success=false) {$('#form-message').textContent=text;$('#form-message').classList.toggle('success',success);}
  async function submitForm(form,fn){const button=form.querySelector('button[type=submit]');button.disabled=true;message('');try{await fn(new FormData(form));}catch(e){message(e.message);}finally{button.disabled=false;}}
  $('#login-form')?.addEventListener('submit',e=>{e.preventDefault();submitForm(e.target,async f=>{const d=await post('/auth/login',{email:f.get('email'),password:f.get('password')});authenticated=true;csrfToken=d.csrfToken;location.href='/watchlist.html';});});
  $('#register-form')?.addEventListener('submit',e=>{e.preventDefault();submitForm(e.target,async f=>{const d=await post('/auth/register',Object.fromEntries(f));message(d.emailSent?'Account created. Check your inbox for a verification link. You can now sign in.':'Account created. Verification email is currently unavailable. You can sign in with your password.',true);e.target.reset();});});
  $('#forgot-password')?.addEventListener('click',async e=>{const email=$('#email');if(!email.value||!email.checkValidity()){email.reportValidity();return;}e.target.disabled=true;try{const d=await post('/auth/forgot-password',{email:email.value});message(d.message,true);}catch(err){message(err.message);}finally{e.target.disabled=false;}});
  $('#reset-form')?.addEventListener('submit',e=>{e.preventDefault();submitForm(e.target,async f=>{if(!params.get('token'))throw new Error('This reset link has no token. Request a new link from the sign-in page.');if(f.get('newPassword')!==f.get('confirmPassword'))throw new Error('The passwords do not match.');await post('/auth/reset-password',{token:params.get('token'),newPassword:f.get('newPassword')});message('Password updated. You can now sign in.',true);e.target.reset();});});
  async function account() {
    const root=$('#account-content');if(!authenticated){empty(root,'Sign in to your account.','Manage your profile, saved listings and price alerts.','<a class="button" href="/login.html">Sign in →</a>');return;}
    try{const d=await request('/auth/me');const u=d.user||d;
      root.innerHTML=`<div class="two-col"><section class="panel"><h2>Your profile</h2><form id="profile-form"><div class="field"><label for="firstName">First name</label><input id="firstName" name="firstName" value="${esc(u.firstName)}" maxlength="60" required></div><div class="field"><label for="lastName">Last name</label><input id="lastName" name="lastName" value="${esc(u.lastName)}" maxlength="60" required></div><p class="fine">${esc(u.email)} · ${u.verified?'Email verified':'Email not verified'}</p><button class="button" type="submit">Save profile</button></form><div class="actions"><a class="button ghost" href="/watchlist.html">Your shortlist ↗</a><button class="button ghost" id="logout">Sign out</button><button class="button ghost" id="logout-all">Sign out all devices</button>${!u.verified?'<button class="button ghost" id="resend-verification">Resend verification email</button>':''}</div></section><section class="panel"><h2>Change password</h2><form id="change-password-form"><div class="field"><label for="currentPassword">Current password</label><input id="currentPassword" name="currentPassword" type="password" autocomplete="current-password" required></div><div class="field"><label for="accountNewPassword">New password</label><input id="accountNewPassword" name="newPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></div><button class="button" type="submit">Update password</button></form><p class="fine">Signed up with Google? Use the password reset option on the sign-in page to set a password.</p></section></div><section class="section"><div class="section-head"><div><h2>Your price alerts</h2><p>Alerts follow an exact listing, not the lowest price of a different product.</p></div></div><div class="panel" id="account-alerts">Loading alerts…</div></section><section class="panel"><h2>Delete your account</h2><p class="fine">Permanently remove your profile, saved listings, alerts and push subscriptions. This cannot be undone.</p><button class="button ghost" id="delete-account">Delete account</button><div id="delete-confirm" hidden><p class="fine">Confirm that you want to permanently delete your account.</p><div class="field"><label for="delete-confirmation">Type DELETE to confirm</label><input id="delete-confirmation" autocomplete="off"></div><button class="button" id="delete-final">Yes, permanently delete my account</button> <button class="button ghost" id="delete-cancel">Cancel</button></div></section>`;
      $('#logout').onclick=async()=>{try{await post('/auth/logout',{});signedOut();location.href='/';}catch(err){toast(err.message);}};
      $('#logout-all').onclick=async()=>{try{await post('/auth/logout-all',{});signedOut();location.href='/login.html';}catch(err){toast(err.message);}};
      $('#resend-verification')?.addEventListener('click',async e=>{e.target.disabled=true;try{const d=await post('/auth/resend-verification',{});toast(d.message);}catch(err){toast(err.message);}finally{e.target.disabled=false;}});
      $('#profile-form').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;try{await post('/auth/update-profile',Object.fromEntries(new FormData(e.target)));toast('Profile updated.');}catch(err){toast(err.message);}finally{b.disabled=false;}};
      $('#change-password-form').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;try{await post('/auth/change-password',Object.fromEntries(new FormData(e.target)));e.target.reset();signedOut();toast('Password updated. All sessions have been signed out.');setTimeout(()=>location.href='/login.html',1800);}catch(err){toast(err.message);}finally{b.disabled=false;}};
      $('#delete-account').onclick=()=>{$('#delete-confirm').hidden=false;$('#delete-final').focus();};$('#delete-cancel').onclick=()=>{$('#delete-confirm').hidden=true;$('#delete-account').focus();};
      $('#delete-final').onclick=async e=>{e.target.disabled=true;try{await request('/auth/account',{method:'DELETE',body:JSON.stringify({confirmation:$('#delete-confirmation').value})});signedOut();location.href='/';}catch(err){toast(err.message);e.target.disabled=false;}};
      await loadAlerts();
    }catch(e){empty(root,'Account unavailable.',e.message);}
  }
  async function loadAlerts(){
    const root=$('#account-alerts');
    try{
      const data=await request('/auth/alerts'),entries=Object.entries(data.alerts||{}).filter(([,a])=>a&&typeof a==='object');
      if(!entries.length){root.innerHTML='<p class="fine">No alerts yet. Open a listing and set your target price.</p>';return;}
      const labels={notified:'Notification sent',target_met:'Target met',above_target:'Above target',listing_not_seen:'Exact listing not seen',delivery_failed:'Delivery failed; will retry',check_failed:'Check failed; will retry'};
      root.innerHTML=entries.map(([key,a])=>`<article class="alert-item"><div><strong>${esc(a.productName)}</strong><p class="fine">${a.listingId?(a.enabled?'Active':'Paused'):'Legacy alert paused—recreate from a current listing'} · ${esc(labels[a.status]||'Waiting for first check')}${a.checkedAt?' · Checked '+esc(date(a.checkedAt)):''}</p>${a.listingId?`<label class="fine" for="target-${esc(key)}">Target USD</label><input class="alert-target" id="target-${esc(key)}" type="number" min="0.01" max="10000000" step="0.01" value="${esc(a.targetPrice)}"><button data-update-alert="${esc(key)}">Save target</button> <button data-toggle-alert="${esc(key)}" data-enabled="${!a.enabled}">${a.enabled?'Pause':'Resume'}</button>`:`<span class="fine">Target ${money(Number(a.targetPrice))}</span>`}</div><button data-delete-alert="${esc(key)}">Remove</button></article>`).join('');
      root.onclick=async e=>{
        const b=e.target.closest('button');if(!b)return;b.disabled=true;
        try{
          if(b.dataset.deleteAlert)await request(`/auth/alerts/${encodeURIComponent(b.dataset.deleteAlert)}`,{method:'DELETE'});
          else if(b.dataset.toggleAlert)await request(`/auth/alerts/${encodeURIComponent(b.dataset.toggleAlert)}`,{method:'PATCH',body:JSON.stringify({enabled:b.dataset.enabled==='true'})});
          else if(b.dataset.updateAlert){const input=$('#target-'+b.dataset.updateAlert);if(!input.checkValidity()){input.reportValidity();return;}await request(`/auth/alerts/${encodeURIComponent(b.dataset.updateAlert)}`,{method:'PATCH',body:JSON.stringify({targetPrice:Number(input.value)})});}
          await loadAlerts();
        }catch(err){toast(err.message);}finally{b.disabled=false;}
      };
    }catch(e){root.textContent=e.message;}
  }
  async function status(){try{const d=await request('/api/status');if($('#google-signin'))$('#google-signin').hidden=!d.googleLogin;if($('#source-status'))$('#source-status').innerHTML=(d.providers||[]).map(p=>`<span class="source-pill">${esc(p.name)}<small>${esc(providerLabels[p.status]||p.status)}</small></span>`).join('');}catch{if($('#source-status'))$('#source-status').textContent='Provider status is temporarily unavailable.';}}
  // The old service worker cached pages containing synthetic product data.
  // Unregister it and remove only DripTrack caches so obsolete screens cannot reappear offline.
  if('serviceWorker' in navigator)navigator.serviceWorker.getRegistrations().then(registrations=>Promise.all(registrations.filter(r=>r.scope===location.origin+'/').map(r=>r.unregister()))).catch(()=>{});
  if('caches' in window)caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('driptrack-')).map(k=>caches.delete(k)))).catch(()=>{});
  updateNav();
  for(const[id,key]of [['min-price','min'],['max-price','max'],['condition-filter','condition'],['sort','sort']])if($('#'+id)&&params.has(key))$('#'+id).value=params.get(key);
  const sessionReady=request('/auth/session').then(d=>{authenticated=!!d.authenticated;csrfToken=d.csrfToken||'';updateNav();}).catch(()=>{});
  if(page==='home')search('Nike Dunk Low Panda');
  if(page==='browse'){if(params.get('q'))search(params.get('q'));else{$('#results').setAttribute('aria-busy','false');$('#result-status').textContent='No search yet';empty($('#results'),'Your next find starts with a search.','Try a full model name or reference number for more relevant results.');}}
  if(page==='product')product();sessionReady.then(()=>{if(page==='watchlist')watchlist();if(page==='account')account();});
  if(page==='login'){
    if(params.get('verified'))message('Email verified. You can now sign in.',true);
    if(params.get('error'))message('Sign-in could not be completed. Try email and password or start Google sign-in again.');
    status();
  }
  if(page==='about')status();
})();
