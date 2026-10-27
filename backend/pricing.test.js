const {test} = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');

test('provider failures stay explicit; concurrent searches share one real request and preserve fetch time', async () => {
  const oldGet=axios.get,oldPost=axios.post;
  const saved={...process.env};
  let shoppingCalls=0,amazonCalls=0,ebayCalls=0;
  process.env.RAINFOREST_API_KEY='test';process.env.EBAY_CLIENT_ID='test';process.env.EBAY_CLIENT_SECRET='test';process.env.SERPAPI_KEY='test';
  axios.post=async()=>{ebayCalls++;throw {response:{status:401}};};
  axios.get=async endpoint=>{
    if(endpoint.includes('rainforest')){amazonCalls++;throw {response:{status:402}};}
    shoppingCalls++;
    await new Promise(resolve=>setTimeout(resolve,5));
    return {data:{shopping_results:[
      {title:'Nike Dunk Low Panda',extracted_price:99,price:'$99.00',source:'Store',product_link:'https://www.google.com/shopping/product/123',product_id:'123'},
      {title:'Nike Dunk Low Panda',extracted_price:1,price:'$1.00',source:'Missing product URL'},
      {title:'Nike socks',extracted_price:10,price:'$10.00',link:'https://example.com/socks'},
      {title:'Nike Dunk Low Panda',extracted_price:80,price:'€80.00',link:'https://example.com/foreign'},
    ]}};
  };
  try{
    const {search}=require('./pricing');
    const [a,b]=await Promise.all([search('Nike Dunk Low Panda'),search('Nike Dunk Low Panda')]);
    assert.equal(shoppingCalls,1);assert.equal(amazonCalls,1);assert.equal(ebayCalls,1);
    assert.equal(a.results.length,1);assert.equal(a.results[0].linkType,'shopping');
    assert.equal(a.results[0].image,null);assert.equal(a.results[0].description,null);
    assert.equal(a.results[0].authenticity,'not_independently_verified');
    assert.equal(a.providers[0].status,'credits_required');assert.equal(a.providers[1].status,'authentication_error');
    assert.equal(a.fetchedAt,b.fetchedAt);
    const cached=await search('Nike Dunk Low Panda');assert.equal(cached.cached,true);assert.equal(cached.fetchedAt,a.fetchedAt);
    const different=await search('Seiko Prospex');assert.deepEqual(different.results,[]);
    assert.equal(amazonCalls,1,'billing failures have a cooldown instead of repeated charges');
    assert.equal(ebayCalls,1);
  }finally{axios.get=oldGet;axios.post=oldPost;for(const key of ['RAINFOREST_API_KEY','EBAY_CLIENT_ID','EBAY_CLIENT_SECRET','SERPAPI_KEY']){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
});
