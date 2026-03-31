/**
 * Minimal ASCII FBX 6.x → GLB converter
 * Supports quads + tris, no UV / normals required (Three.js computes normals)
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const src  = process.argv[2];
const dest = process.argv[3];
if (!src || !dest) { console.error('Usage: node fbx2glb.js input.fbx output.glb'); process.exit(1); }

const text = fs.readFileSync(src, 'utf8');

// ── 1. Find the mesh Geometry block with the most vertices ────────────────────
// We look for lines starting with "Vertices:" and "PolygonVertexIndex:"
const lines = text.split('\n');

let rawVerts = null, rawPoly = null, maxLen = 0;
let pendingVerts = null;

for (let i = 0; i < lines.length; i++) {
  const trimmed = lines[i].trim();

  // FBX sometimes wraps the value onto the next line starting with ','
  if (pendingVerts !== null) {
    if (trimmed.startsWith(',')) {
      pendingVerts += trimmed;
    } else {
      const nums = pendingVerts.split(',').map(Number).filter(n => !isNaN(n));
      if (nums.length > maxLen) { rawVerts = nums; maxLen = nums.length; }
      pendingVerts = null;
    }
  }

  if (trimmed.startsWith('Vertices:')) {
    const afterColon = trimmed.slice('Vertices:'.length).trim();
    // Check if next line continues with ','
    if (i + 1 < lines.length && lines[i + 1].trim().startsWith(',')) {
      pendingVerts = afterColon;
    } else {
      const nums = afterColon.split(',').map(Number).filter(n => !isNaN(n));
      if (nums.length > maxLen) { rawVerts = nums; maxLen = nums.length; }
    }
  }

  if (trimmed.startsWith('PolygonVertexIndex:') && rawVerts) {
    const afterColon = trimmed.slice('PolygonVertexIndex:'.length).trim();
    rawPoly = afterColon.split(',').map(Number);
    break; // Got what we need from the first/main mesh
  }
}

// Also handle line-continuation for pendingVerts at end of file
if (pendingVerts) {
  const nums = pendingVerts.split(',').map(Number).filter(n => !isNaN(n));
  if (nums.length > maxLen) rawVerts = nums;
}

if (!rawVerts || !rawPoly) {
  console.error('Could not find mesh geometry in FBX file.');
  process.exit(1);
}

console.log(`Found ${rawVerts.length / 3} vertices, ${rawPoly.length} polygon indices`);

// ── 2. Build vertex positions array (flat Float32) ───────────────────────────
// FBX is Z-up, glTF is Y-up → swap Y and Z, negate new Y (was Z)
const verts = [];
for (let i = 0; i + 2 < rawVerts.length; i += 3) {
  verts.push(rawVerts[i]);        // x stays
  verts.push(rawVerts[i + 2]);    // z → y
  verts.push(-rawVerts[i + 1]);   // -y → z  (right-hand to right-hand flip)
}

// ── 3. Triangulate polygons ────────────────────────────────────────────────────
// FBX: negative index = -(n+1) = last vertex of polygon; quads & tris
const indices = [];
let face = [];

function addFace(f) {
  // Fan triangulation
  for (let k = 1; k + 1 < f.length; k++) {
    indices.push(f[0], f[k], f[k + 1]);
  }
}

for (const raw of rawPoly) {
  if (raw < 0) {
    face.push(-(raw + 1));
    addFace(face);
    face = [];
  } else {
    face.push(raw);
  }
}
if (face.length) addFace(face); // flush any open face

console.log(`Triangulated: ${indices.length / 3} triangles`);

// ── 4. Pack into GLB ──────────────────────────────────────────────────────────
// Align buffer to 4 bytes
function align4(n) { return (n + 3) & ~3; }
function pad4(buf)  {
  const rem = buf.length % 4;
  return rem ? Buffer.concat([buf, Buffer.alloc(4 - rem, 0x20)]) : buf;
}

const posArr  = new Float32Array(verts);
const idxArr  = new Uint16Array(indices);          // <65536 vertices assumed
const idxBuf  = pad4(Buffer.from(idxArr.buffer));  // indices first in binary
const posBuf  = pad4(Buffer.from(posArr.buffer));  // positions second

// Compute bounding box for GLTF accessor
let minX = Infinity, minY = Infinity, minZ = Infinity;
let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
for (let i = 0; i < verts.length; i += 3) {
  minX = Math.min(minX, verts[i]);   maxX = Math.max(maxX, verts[i]);
  minY = Math.min(minY, verts[i+1]); maxY = Math.max(maxY, verts[i+1]);
  minZ = Math.min(minZ, verts[i+2]); maxZ = Math.max(maxZ, verts[i+2]);
}

// BUG FIX: pack indices first so BV0(offset=0)=indices, BV1(offset=idxBuf.length)=positions
const binBuffer = Buffer.concat([idxBuf, posBuf]);

const gltf = {
  asset: { version: '2.0', generator: 'fbx2glb-minimal' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes:  [{ mesh: 0 }],
  meshes: [{
    primitives: [{
      attributes: { POSITION: 1 },
      indices: 0,
      mode: 4,   // TRIANGLES
    }]
  }],
  accessors: [
    {
      bufferView: 0,
      componentType: 5123,     // UNSIGNED_SHORT
      count: indices.length,
      type: 'SCALAR',
    },
    {
      bufferView: 1,
      componentType: 5126,     // FLOAT
      count: verts.length / 3,
      type: 'VEC3',
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ],
    },
  ],
  bufferViews: [
    { buffer: 0, byteOffset: 0,            byteLength: idxBuf.length },
    { buffer: 0, byteOffset: idxBuf.length, byteLength: posBuf.length },
  ],
  buffers: [{ byteLength: binBuffer.length }],
};

const jsonStr   = JSON.stringify(gltf);
const jsonBuf   = pad4(Buffer.from(jsonStr, 'utf8'));

// GLB structure: 12-byte header + JSON chunk + BIN chunk
const totalLen  = 12 + 8 + jsonBuf.length + 8 + binBuffer.length;
const header    = Buffer.alloc(12);
header.writeUInt32LE(0x46546C67, 0);  // magic 'glTF'
header.writeUInt32LE(2, 4);           // version 2
header.writeUInt32LE(totalLen, 8);

const jsonChunkHead = Buffer.alloc(8);
jsonChunkHead.writeUInt32LE(jsonBuf.length, 0);
jsonChunkHead.writeUInt32LE(0x4E4F534A, 4); // 'JSON'

const binChunkHead = Buffer.alloc(8);
binChunkHead.writeUInt32LE(binBuffer.length, 0);
binChunkHead.writeUInt32LE(0x004E4942, 4);  // 'BIN\0'

const glb = Buffer.concat([header, jsonChunkHead, jsonBuf, binChunkHead, binBuffer]);
fs.writeFileSync(dest, glb);
console.log(`✅ Written: ${dest}  (${glb.length} bytes)`);
