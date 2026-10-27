const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const vm=require('vm');
const http=require('http');
const express=require('express');
const mongoose=require('mongoose');
const path=require('path');

test('account, shortlist and exact-listing alert route contracts (isolated in-memory database)',async()=>{
  const stores=new Map();
  function query(value){const promise=Promise.resolve(value);promise.select=()=>query(value);return promise;}
  function model(name){if(stores.has(name))return stores.get(name).Model;const rows=[];
    class Model{
      constructor(data){Object.assign(this,{_id:String(rows.length+1),watchlist:[],priceAlerts:{},createdAt:new Date()},data);}
      async save(){if(!rows.includes(this))rows.push(this);return this;}
      markModified(){}
      static findOne(filter){return query(rows.find(row=>Object.entries(filter).every(([k,v])=>row[k]===v))||null);}
      static findById(id){return query(rows.find(row=>row._id===id)||null);}
      static async findByIdAndUpdate(id,patch){const row=rows.find(r=>r._id===id);if(row)Object.assign(row,patch);return row;}
      static async findByIdAndDelete(id){const i=rows.findIndex(r=>r._id===id);if(i>=0)rows.splice(i,1);}
      static async deleteMany(){rows.length=0;}
    }
    stores.set(name,{Model,rows});return Model;
  }
  const app=express();app.listen=()=>{};
  const expressMock=()=>app;expressMock.json=express.json;
  const listing={id:'a'.repeat(24),title:'Nike Dunk Low Panda',price:99,currency:'USD',source:'Test fixture',provider:'Test fixture',url:'https://example.com/product/1',fetchedAt:new Date().toISOString()};
  const context={require: name=>{
    if(name==='express')return expressMock;
    if(name==='mongoose')return {Schema:mongoose.Schema,model,connection:{readyState:1},connect:async()=>{}};
    if(name==='dotenv')return {config:()=>{}};
    if(name==='./pricing')return {search:async()=>({results:[listing],cached:true}),providerStatus:()=>[]};
    return require(name);
  },process:{env:{JWT_SECRET:'isolated-route-test-secret',PORT:'0'},exit:()=>{}},__dirname:__dirname,console:{log:()=>{},error:()=>{},warn:()=>{}},setTimeout:()=>0,setInterval:()=>0,URLSearchParams,Buffer};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'server.js'),'utf8'),context);
  const server=http.createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const root=`http://127.0.0.1:${server.address().port}`;
  let token;
  const call=async(route,method='GET',body)=>{const r=await fetch(root+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  try{
    assert.equal((await call('/auth/watchlist')).status,401);
    assert.equal((await call('/auth/register','POST',{email:{$ne:null}})).status,400);
    const credentials={firstName:'Route',lastName:'Test',email:'route-test@example.invalid',password:'Test-only-random-password-7428'};
    assert.equal((await call('/auth/register','POST',credentials)).status,200);
    assert.equal((await call('/auth/login','POST',{email:credentials.email,password:'wrong'})).status,401);
    const login=await call('/auth/login','POST',credentials);assert.equal(login.status,200);assert.ok(login.data.token);token=login.data.token;
    const product=JSON.stringify({...listing,searchQuery:'Nike Dunk Low Panda'});
    assert.equal((await call('/auth/watchlist','POST',{product})).status,200);
    assert.equal((await call('/auth/watchlist','POST',{product})).status,200);
    assert.equal((await call('/auth/watchlist')).data.watchlist.length,1,'saving twice does not duplicate a listing');
    assert.equal((await call('/auth/alerts','POST',{productName:listing.title,targetPrice:-1})).status,400);
    assert.equal((await call('/auth/alerts','POST',{productName:listing.title,targetPrice:80,listingId:listing.id,searchQuery:listing.title})).status,200);
    const alerts=await call('/auth/alerts');assert.equal(alerts.data.alerts[listing.id].listingId,listing.id);
    assert.equal((await call('/auth/alerts/'+listing.id,'DELETE')).status,200);
    assert.deepEqual((await call('/auth/alerts')).data.alerts,{});
    assert.equal((await call('/auth/update-profile','POST',{firstName:'Updated',lastName:'Test'})).status,200);
    assert.equal(stores.get('User').rows[0].firstName,'Updated');
    assert.equal((await call('/auth/watchlist/0','DELETE')).status,200);
    assert.equal((await call('/auth/watchlist')).data.watchlist.length,0);
    assert.equal((await call('/auth/account','DELETE')).status,200);
    assert.equal(stores.get('User').rows.length,0);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
