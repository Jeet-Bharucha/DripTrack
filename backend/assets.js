const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const files=['site.css','site.js','shop-utils.js'];
const assetVersion=crypto.createHash('sha256').update(files.map(file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8').replace(/\r\n/g,'\n')).join('\n')).digest('hex').slice(0,12);
module.exports={assetVersion};
