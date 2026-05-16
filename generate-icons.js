// Run this once: node generate-icons.js
// Generates icon-192.png and icon-512.png for the PWA manifest
const { createCanvas } = require('canvas');
const fs = require('fs');

function generateIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, size, size);

  // Yellow accent border
  ctx.strokeStyle = '#e8ff00';
  ctx.lineWidth = size * 0.03;
  ctx.strokeRect(size*0.05, size*0.05, size*0.9, size*0.9);

  // Text "DT"
  ctx.fillStyle = '#e8ff00';
  ctx.font = `bold ${size * 0.42}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('DT', size / 2, size / 2);

  return canvas.toBuffer('image/png');
}

try {
  fs.writeFileSync('icon-192.png', generateIcon(192));
  fs.writeFileSync('icon-512.png', generateIcon(512));
  console.log('✅ Icons generated: icon-192.png, icon-512.png');
} catch (e) {
  console.log('⚠️  Could not generate icons (canvas not installed)');
  console.log('   Run: npm install canvas  OR  use any 192x192 and 512x512 PNG files');
}
