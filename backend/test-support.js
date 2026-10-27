const fs=require('fs'),vm=require('vm'),http=require('http'),express=require('express'),mongoose=require('mongoose'),path=require('path');
async function harness({database=true,port=0,origin='https://driptrack.test'}={}){
  const stores=new Map(),mail=[];
  const listing={id:'a'.repeat(24),title:'Nike Dunk Low Panda',price:99,currency:'USD',source:'Test fixture',provider:'Test fixture',url:'https://example.com/product/1',image:null,fetchedAt:new Date().toISOString()};
  const listings=[listing,{...listing,id:'c'.repeat(24),title:'Nike Dunk Low Panda size 10',source:'Second test fixture',price:120,condition:'New with box'}];
  function matches(row,filter){return Object.entries(filter).every(([key,value])=>{
    if(key==='$or')return value.some(v=>matches(row,v));
    if(key==='sessions.hash')return row.sessions?.some(s=>s.hash===value);
    if(value&&typeof value==='object'&&'$gt'in value)return new Date(row[key]).getTime()>new Date(value.$gt).getTime();
    if(value&&typeof value==='object'&&'$exists'in value)return (row[key]!==undefined)===value.$exists;
    return String(row[key])===String(value);
  });}
  function query(value){const p=Promise.resolve(value);p.select=()=>query(value);p.sort=()=>query(value);p.limit=n=>query(Array.isArray(value)?value.slice(0,n):value);return p;}
  function model(name){if(stores.has(name))return stores.get(name).Model;const rows=[];
    class Model{
      constructor(data){Object.assign(this,{_id:String(rows.length+1),watchlist:[],sessions:[],priceAlerts:{},createdAt:new Date()},data);}
      async save(){if(!rows.includes(this))rows.push(this);return this;}
      markModified(){}
      static findOne(filter){return query(rows.find(row=>matches(row,filter))||null);}
      static findById(id){return query(rows.find(row=>String(row._id)===String(id))||null);}
      static find(filter){return query(rows.filter(row=>matches(row,filter)));}
      static async findOneAndUpdate(filter,patch,options){let row=rows.find(r=>matches(r,filter));if(!row&&options?.upsert){row=new this(filter);await row.save();}if(row){
        if(patch.$set)Object.assign(row,patch.$set);
        if(patch.$push)for(const[key,value]of Object.entries(patch.$push)){row[key]=[...(row[key]||[]),...(value.$each||[value])];if(value.$slice)row[key]=row[key].slice(value.$slice);}
        if(patch.$pull)for(const[key,value]of Object.entries(patch.$pull))row[key]=(row[key]||[]).filter(entry=>!matches(entry,value));
        for(const[key,value]of Object.entries(patch))if(!key.startsWith('$'))row[key]=value;
      }return row;}
      static async findByIdAndUpdate(id,patch){return this.findOneAndUpdate({_id:id},patch);}
      static async findByIdAndDelete(id){const i=rows.findIndex(r=>String(r._id)===String(id));if(i>=0)rows.splice(i,1);}
      static async deleteMany(filter){for(let i=rows.length-1;i>=0;i--)if(matches(rows[i],filter||{}))rows.splice(i,1);}
      static async deleteOne(filter){const index=rows.findIndex(r=>matches(r,filter));if(index>=0)rows.splice(index,1);}
      static async create(data){return new this(data).save();}
      static async countDocuments(){return rows.length;}
    }
    stores.set(name,{Model,rows});return Model;
  }
  const app=express();app.listen=()=>{};const expressMock=()=>app;expressMock.json=express.json;
  const context={require:name=>{
    if(name==='express')return expressMock;
    if(name==='mongoose')return {Schema:mongoose.Schema,model,connection:{readyState:database?1:0},connect:async()=>{}};
    if(name==='dotenv')return {config:()=>{}};
    if(name==='nodemailer')return {createTransport:()=>({verify:cb=>cb(null),sendMail:async data=>{mail.push(data);return {accepted:[data.to]};}})};
    if(name==='./pricing')return {search:async()=>({results:listings,cached:true,providers:[],totalSources:2,fetchedAt:listing.fetchedAt}),listing:async(q,id)=>listings.find(i=>i.id===id)||null,providerStatus:()=>[]};
    return require(name);
  },process:{env:{JWT_SECRET:'isolated-route-test-secret-32-chars-minimum',PORT:String(port),GMAIL_USER:'test@example.invalid',GMAIL_PASS:'test-only',PUBLIC_URL:origin,GOOGLE_CLIENT_ID:'test',GOOGLE_CLIENT_SECRET:'test'},exit:()=>{}},__dirname,console:{log:()=>{},error:()=>{},warn:()=>{}},setTimeout:()=>0,setInterval:()=>0,URLSearchParams,URL,Buffer};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'server.js'),'utf8'),context);
  const server=http.createServer(app);await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));const root=`http://127.0.0.1:${server.address().port}`;
  function client(){let cookie='',csrf='';return {
    get cookie(){return cookie;},set cookie(value){cookie=value;},get csrf(){return csrf;},set csrf(value){csrf=value;},
    async call(route,method='GET',body,extra={}){
      const response=await fetch(root+route,{method,redirect:'manual',headers:{'Content-Type':'application/json','X-DripTrack-Request':'1',...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{}),...extra.headers},body:extra.raw!==undefined?extra.raw:body!==undefined?JSON.stringify(body):undefined});
      const text=await response.text();let data;try{data=JSON.parse(text);}catch{data=text;}
      const set=response.headers.get('set-cookie');if(set&&/^(?:__Host-)?driptrack_session=/.test(set))cookie=set.split(';')[0];
      if(data?.csrfToken)csrf=data.csrfToken;
      return {status:response.status,data,headers:response.headers,text};
    },
  };}
  async function user(client,email='test@example.invalid'){
    const credentials={firstName:'Route',lastName:'Test',email,password:'Test-only-random-password-7428'};
    const register=await client.call('/auth/register','POST',credentials);if(register.status!==200)throw new Error('Fixture registration failed: '+JSON.stringify(register.data));
    const row=stores.get('User').rows.find(r=>r.email===email);row.verified=true;
    const login=await client.call('/auth/login','POST',credentials);if(login.status!==200)throw new Error('Fixture login failed');return {credentials,row,login};
  }
  return {client,user,stores,mail,listing,listings,root,context,close:()=>new Promise(resolve=>server.close(resolve))};
}
module.exports={harness};
