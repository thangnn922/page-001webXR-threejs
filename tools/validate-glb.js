'use strict';
/**
 * Validates cube.glb using gltf-validator before any push.
 * Run via: npm test  or  npm run validate:glb
 */
const validator = require('gltf-validator');
const fs = require('fs');
const path = require('path');

const glbPath = path.join(__dirname, '..', 'cube.glb');
const asset = new Uint8Array(fs.readFileSync(glbPath));

validator.validateBytes(asset).then(report => {
  const { numErrors, numWarnings, numHints, messages } = report.issues;
  const { totalTriangleCount, totalVertexCount } = report.info;

  console.log(`GLB: ${totalVertexCount} vertices, ${totalTriangleCount} triangles`);
  console.log(`Errors: ${numErrors} | Warnings: ${numWarnings} | Hints: ${numHints}`);

  if (messages.length) {
    messages.forEach(m => console.log(`  [sev ${m.severity}] ${m.code}: ${m.message}`));
  }

  if (numErrors > 0 || numWarnings > 0) {
    console.error('❌ GLB validation failed – fix errors before pushing.');
    process.exit(1);
  }
  console.log('✅ GLB valid – safe to push.');
}).catch(err => {
  console.error('Validator crashed:', err.message);
  process.exit(1);
});
