(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.DripShop=factory();})(typeof window==='object'?window:this,function(){
  'use strict';
  function filterListings(items,filters={}){
    return items.filter(item=>{
      if(filters.source&&item.source!==filters.source)return false;
      if(filters.min!==''&&filters.min!=null&&item.price<Number(filters.min))return false;
      if(filters.max!==''&&filters.max!=null&&item.price>Number(filters.max))return false;
      if(filters.condition==='new'&&!/^new\b/i.test(item.condition||''))return false;
      if(filters.condition==='used'&&!/pre-owned|used/i.test(item.condition||''))return false;
      if(filters.condition==='unknown'&&item.condition)return false;
      return true;
    });
  }
  function validRange(min,max){
    if([min,max].some(v=>v!==''&&(!Number.isFinite(Number(v))||Number(v)<0||Number(v)>10000000)))return false;
    return min===''||max===''||Number(min)<=Number(max);
  }
  function csvCell(value){
    let text=String(value??'');
    if(/^[\s\x00-\x20]*[=+\-@]/.test(text)||/^[\t\r\n]/.test(text))text="'"+text;
    return '"'+text.replace(/"/g,'""')+'"';
  }
  function watchlistCsv(items){
    const rows=[['Title','Retailer','Price USD','Condition','Fetched at','Source URL','Search'],...items.map(i=>[i.title,i.source,i.price,i.condition,i.fetchedAt,i.url,i.searchQuery])];
    return '\ufeff'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n');
  }
  function priceChange(item){
    if(!Number.isFinite(item.price)||!Number.isFinite(item.previousPrice)||item.previousPrice<=0)return null;
    const difference=item.price-item.previousPrice;
    return {difference,percent:difference/item.previousPrice*100};
  }
  function normalizeSaved(raw){
    try{const item=typeof raw==='string'?JSON.parse(raw):raw;return item&&typeof item==='object'&&!Array.isArray(item)?item:{title:String(item??'Previously saved item')};}
    catch{return {title:String(raw)};}
  }
  function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  return {filterListings,validRange,csvCell,watchlistCsv,priceChange,normalizeSaved,escapeHtml};
});
