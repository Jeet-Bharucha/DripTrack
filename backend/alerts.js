function evaluateAlert(alert, results, checkedAt = new Date().toISOString()) {
  if (!alert.enabled || !alert.listingId || !Number.isFinite(alert.targetPrice) || alert.targetPrice <= 0) return {status:'paused',notify:false};
  const item = results.find(r=>r.id===alert.listingId && r.currency==='USD' && Number.isFinite(r.price) && r.price>0);
  if (!item) return {status:'listing_not_seen',checkedAt,notify:false};
  const below = item.price <= alert.targetPrice;
  return {status:below?'target_met':'above_target',checkedAt,lastPrice:item.price,notify:below&&!alert.triggered,rearm:!below,item};
}
module.exports={evaluateAlert};
