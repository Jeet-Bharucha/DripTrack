'use strict';
const crypto = require('crypto');
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
function cookie(req, name) {
  const entry = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(name + '='));
  return entry ? entry.slice(name.length + 1) : '';
}
function sessionTools(origin, secret) {
  const secure = new URL(origin).protocol === 'https:';
  const cookieName = secure ? '__Host-driptrack_session' : 'driptrack_session';
  const options = {httpOnly:true, secure, sameSite:'lax', path:'/', maxAge:SESSION_MS};
  const csrf = value => crypto.createHmac('sha256', secret).update('csrf:' + value).digest('hex');
  return {
    name:cookieName,
    read:req => cookie(req,cookieName),
    csrf,
    checkCsrf:(req,value)=>equal(req.headers['x-csrf-token'],csrf(value)),
    issue(res) {
      const value = crypto.randomBytes(32).toString('hex');
      res.cookie(cookieName,value,options);
      return {value, record:{hash:digest(value),createdAt:new Date(),expiresAt:new Date(Date.now()+SESSION_MS)}};
    },
    clear:res=>res.clearCookie(cookieName,{httpOnly:true,secure,sameSite:'lax',path:'/'}),
  };
}
function requestGuard(origin) {
  const allowed = new URL(origin).origin;
  return (req,res,next)=>{
    if (['GET','HEAD','OPTIONS'].includes(req.method)) return next();
    if (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && req.headers.origin !== allowed)) return res.status(403).json({message:'Cross-site requests are not allowed.'});
    if (req.headers['x-driptrack-request'] !== '1') return res.status(403).json({message:'Reload the page and try again.'});
    if (req.method !== 'DELETE' && !req.is('application/json')) return res.status(415).json({message:'Send requests as JSON.'});
    next();
  };
}
function securityHeaders(req,res,next) {
  res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https: data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  res.set('X-Content-Type-Options','nosniff');res.set('X-Frame-Options','DENY');
  res.set('Referrer-Policy','strict-origin-when-cross-origin');
  res.set('Permissions-Policy','camera=(), microphone=(), geolocation=(), payment=()');
  if(req.secure)res.set('Strict-Transport-Security','max-age=31536000');
  if(req.path.startsWith('/auth/'))res.set('Cache-Control','no-store');
  next();
}
function cleanName(value){return typeof value === 'string' && value.trim().length > 0 && value.length <= 60 && !/[<>\u0000-\u001f]/.test(value);}
function validPassword(value){return typeof value === 'string' && value.length >= 8 && Buffer.byteLength(value,'utf8') <= 72;}
function validEmail(value){return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);}
function publicUser(user){return {id:String(user._id),firstName:user.firstName,lastName:user.lastName,email:user.email,verified:!!user.verified,createdAt:user.createdAt};}
function limiter({max,windowMs,key,now=Date.now}) {
  const entries=new Map();
  return (req,res,next)=>{
    const time=now(),k=key(req);let entry=entries.get(k);
    if(!entry||time>=entry.until){entry={count:0,until:time+windowMs};entries.set(k,entry);}
    if(entries.size>1000)for(const [id,value] of entries)if(time>=value.until)entries.delete(id);
    if(entries.size>10000||++entry.count>max){res.set('Retry-After',String(Math.ceil((entry.until-time)/1000)));return res.status(429).json({message:'Too many attempts. Please try again later.'});}
    next();
  };
}
module.exports={digest,equal,cookie,sessionTools,requestGuard,securityHeaders,cleanName,validPassword,validEmail,publicUser,limiter};
