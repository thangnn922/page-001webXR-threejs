import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ─── DOM refs ────────────────────────────────────────────────────────────────
const statusEl = document.getElementById('status');
const startBtn = document.getElementById('start-btn');
const overlay  = document.getElementById('overlay');
const arHint   = document.getElementById('ar-hint');

statusEl.textContent = 'Loading 3D assets…';

// ─── Renderer ─────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);

// Stop the loop cleanly before page teardown (Bug 1 fix)
window.addEventListener('beforeunload', () => {
  renderer.setAnimationLoop(null);
  renderer.dispose();
});

// ─── Scene & Camera ───────────────────────────────────────────────────────────
const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

scene.add(new THREE.AmbientLight(0xffffff, 1.4));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.6);
dirLight.position.set(1, 3, 2);
scene.add(dirLight);
const fillLight = new THREE.DirectionalLight(0xaaccff, 0.5);
fillLight.position.set(-2, 1, -1);
scene.add(fillLight);

// ─── Object 1: Code-drawn white cube ──────────────────────────────────────────
const CUBE_SIZE = 0.10;
const cubeGeo  = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
const cubeMat  = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.05 });
const codeCube = new THREE.Mesh(cubeGeo, cubeMat);
codeCube.visible = false;
codeCube.userData.label = 'code-cube';
scene.add(codeCube);

// Wireframe overlay for the code cube
codeCube.add(new THREE.Mesh(
  cubeGeo,
  new THREE.MeshBasicMaterial({ color: 0x888888, wireframe: true, transparent: true, opacity: 0.35 })
));

// ─── Object 2: FBX model ──────────────────────────────────────────────────────
let fbxModel = null;
const fbxMat = new THREE.MeshStandardMaterial({ color: 0x88ccff, roughness: 0.3, metalness: 0.4 });

// Load the converted GLB (originally cube.fbx, converted to cube.glb via tools/fbx2glb.js)
const loader = new GLTFLoader();
loader.load(
  './cube.glb',
  (gltf) => {
    const model = gltf.scene;

    // Normalise size to ~10 cm (same as the code cube)
    const box    = new THREE.Box3().setFromObject(model);
    const size   = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale  = CUBE_SIZE / maxDim;
    model.scale.setScalar(scale);

    // Apply blue-metallic material to every mesh inside
    model.traverse((child) => {
      if (child.isMesh) {
        child.material = fbxMat;
      }
    });

    model.visible = false;
    model.userData.label = 'fbx-cube';
    scene.add(model);
    fbxModel = model;

    // Race condition fix: if XR session already started and spawn already ran,
    // position the model immediately using the stored spawn layout
    if (spawned) placeFbxModel();

    statusEl.textContent = '✅ Assets ready — tap Enter AR!';
  },
  (xhr) => {
    if (xhr.total) statusEl.textContent = `Loading model… ${Math.round(xhr.loaded / xhr.total * 100)}%`;
  },
  (err) => {
    console.error('GLB load error:', err);
    statusEl.textContent = '⚠️ Model failed – code cube only. Tap Enter AR.';
  }
);

// ─── Grab state ───────────────────────────────────────────────────────────────
// Grabbable objects list (populated once FBX loads)
function grabbables() {
  const list = [codeCube];
  if (fbxModel) list.push(fbxModel);
  return list;
}

const grabState  = {};          // key → { grabbing, offset, source, target }
const _invSrc    = new THREE.Matrix4();
const _wPos      = new THREE.Vector3();
const _wQuat     = new THREE.Quaternion();
const _wSca      = new THREE.Vector3();
const _srcPos    = new THREE.Vector3();
const _objPos    = new THREE.Vector3();
const _grabMat   = new THREE.Matrix4();

function tryGrab(source, key, radius) {
  if (grabState[key]?.grabbing) return;
  source.getWorldPosition(_srcPos);

  // Find the closest grabbable object within radius
  let closest = null, closestDist = radius;
  for (const obj of grabbables()) {
    if (!obj.visible) continue;
    obj.getWorldPosition(_objPos);
    const d = _srcPos.distanceTo(_objPos);
    if (d < closestDist) { closestDist = d; closest = obj; }
  }
  if (!closest) return;

  _invSrc.copy(source.matrixWorld).invert();
  grabState[key] = {
    grabbing: true,
    offset:   new THREE.Matrix4().multiplyMatrices(_invSrc, closest.matrixWorld),
    source,
    target:   closest,
  };
  // Highlight grabbed object
  closest.traverse(c => { if (c.isMesh) c.material.emissive?.set(0x555555); });
}

function releaseGrab(key) {
  if (!grabState[key]) return;
  const target = grabState[key].target;
  grabState[key].grabbing = false;
  // Clear highlight only if no other grab holds the same object
  const stillHeld = Object.values(grabState).some(s => s.grabbing && s.target === target);
  if (!stillHeld) target?.traverse(c => { if (c.isMesh) c.material.emissive?.set(0x000000); });
}

// ─── Controllers ─────────────────────────────────────────────────────────────
for (let i = 0; i < 2; i++) {
  const ctrl = renderer.xr.getController(i);
  const key  = `ctrl_${i}`;
  ctrl.addEventListener('selectstart', () => tryGrab(ctrl, key, 0.20));
  ctrl.addEventListener('selectend',   () => releaseGrab(key));
  scene.add(ctrl);

  const ray = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0,  0),
      new THREE.Vector3(0, 0, -0.4),
    ]),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 })
  );
  ray.name = 'ray';
  ctrl.add(ray);
}

// ─── Hand Tracking (manual joint spheres — no jsm factory needed) ─────────────
const skinMat = new THREE.MeshStandardMaterial({ color: 0xffccaa, roughness: 0.6 });

const JOINT_NAMES = [
  'wrist',
  'thumb-metacarpal','thumb-phalanx-proximal','thumb-phalanx-distal','thumb-tip',
  'index-finger-metacarpal','index-finger-phalanx-proximal',
  'index-finger-phalanx-intermediate','index-finger-phalanx-distal','index-finger-tip',
  'middle-finger-metacarpal','middle-finger-phalanx-proximal',
  'middle-finger-phalanx-intermediate','middle-finger-phalanx-distal','middle-finger-tip',
  'ring-finger-metacarpal','ring-finger-phalanx-proximal',
  'ring-finger-phalanx-intermediate','ring-finger-phalanx-distal','ring-finger-tip',
  'pinky-finger-metacarpal','pinky-finger-phalanx-proximal',
  'pinky-finger-phalanx-intermediate','pinky-finger-phalanx-distal','pinky-finger-tip',
];

const BONES = [
  ['wrist','thumb-metacarpal'],['thumb-metacarpal','thumb-phalanx-proximal'],
  ['thumb-phalanx-proximal','thumb-phalanx-distal'],['thumb-phalanx-distal','thumb-tip'],
  ['wrist','index-finger-metacarpal'],
  ['index-finger-metacarpal','index-finger-phalanx-proximal'],
  ['index-finger-phalanx-proximal','index-finger-phalanx-intermediate'],
  ['index-finger-phalanx-intermediate','index-finger-phalanx-distal'],
  ['index-finger-phalanx-distal','index-finger-tip'],
  ['wrist','middle-finger-metacarpal'],
  ['middle-finger-metacarpal','middle-finger-phalanx-proximal'],
  ['middle-finger-phalanx-proximal','middle-finger-phalanx-intermediate'],
  ['middle-finger-phalanx-intermediate','middle-finger-phalanx-distal'],
  ['middle-finger-phalanx-distal','middle-finger-tip'],
  ['wrist','ring-finger-metacarpal'],
  ['ring-finger-metacarpal','ring-finger-phalanx-proximal'],
  ['ring-finger-phalanx-proximal','ring-finger-phalanx-intermediate'],
  ['ring-finger-phalanx-intermediate','ring-finger-phalanx-distal'],
  ['ring-finger-phalanx-distal','ring-finger-tip'],
  ['wrist','pinky-finger-metacarpal'],
  ['pinky-finger-metacarpal','pinky-finger-phalanx-proximal'],
  ['pinky-finger-phalanx-proximal','pinky-finger-phalanx-intermediate'],
  ['pinky-finger-phalanx-intermediate','pinky-finger-phalanx-distal'],
  ['pinky-finger-phalanx-distal','pinky-finger-tip'],
  ['index-finger-metacarpal','middle-finger-metacarpal'],
  ['middle-finger-metacarpal','ring-finger-metacarpal'],
  ['ring-finger-metacarpal','pinky-finger-metacarpal'],
];

const boneMat  = new THREE.LineBasicMaterial({ color: 0xffddbb, transparent: true, opacity: 0.75 });
const handData = [null, null];

function buildHandVisual(hand, idx) {
  if (handData[idx]) destroyHandVisual(idx);
  const jointMeshes = new Map();
  for (const name of JOINT_NAMES) {
    const joint = hand.joints[name];
    if (!joint) continue;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(joint.jointRadius ?? 0.008, 8, 6),
      skinMat
    );
    joint.add(mesh);
    jointMeshes.set(name, mesh);
  }
  const boneLines = [];
  for (const [a, b] of BONES) {
    const geo  = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(geo, boneMat);
    scene.add(line);
    boneLines.push({ line, a, b });
  }
  handData[idx] = { jointMeshes, boneLines, hand };
}

function destroyHandVisual(idx) {
  const data = handData[idx];
  if (!data) return;
  for (const m of data.jointMeshes.values()) { m.geometry.dispose(); m.parent?.remove(m); }
  for (const l of data.boneLines)            { l.line.geometry.dispose(); scene.remove(l.line); }
  handData[idx] = null;
}

const PINCH_ENTER = 0.030;
const PINCH_EXIT  = 0.045;
const pinching    = [false, false];
const _tipA = new THREE.Vector3();
const _tipB = new THREE.Vector3();

for (let i = 0; i < 2; i++) {
  const hand = renderer.xr.getHand(i);
  scene.add(hand);

  hand.addEventListener('connected', (evt) => {
    // Quest 3: evt.data.hand is set immediately.
    // PICO 4: evt.data.hand may be null here; joints get populated a frame later.
    // We attempt to build now, and the render-loop fallback catches the PICO 4 case.
    if (evt.data?.hand) {
      buildHandVisual(hand, i);
    }
    const ray = renderer.xr.getController(i).getObjectByName('ray');
    if (ray) ray.visible = false;
  });

  hand.addEventListener('disconnected', () => {
    destroyHandVisual(i);
    releaseGrab(`hand_${i}`);
    pinching[i] = false;
    const ray = renderer.xr.getController(i).getObjectByName('ray');
    if (ray) ray.visible = true;
  });
}

// ─── Resize ───────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ─── Helpers: spawn two objects side-by-side in front of the camera ───────────
// Store spawn layout so late-loading models can place themselves
const _spawnBase  = new THREE.Vector3();
const _spawnRight = new THREE.Vector3();

function placeFbxModel() {
  if (!fbxModel) return;
  fbxModel.position.copy(_spawnBase).addScaledVector(_spawnRight, 0.12);
  fbxModel.rotation.set(0, 0, 0);
  fbxModel.visible = true;
}

function spawnObjects() {
  const xrCam = renderer.xr.getCamera();
  const cPos  = new THREE.Vector3();
  const cDir  = new THREE.Vector3();
  xrCam.getWorldPosition(cPos);
  xrCam.getWorldDirection(cDir);
  cDir.y = 0; cDir.normalize();

  // Side offset vector (perpendicular to forward, horizontal)
  _spawnRight.crossVectors(cDir, new THREE.Vector3(0, 1, 0)).normalize();

  _spawnBase.copy(cPos).addScaledVector(cDir, 0.55);
  _spawnBase.y = cPos.y - 0.20;

  // Code cube: slightly to the left
  codeCube.position.copy(_spawnBase).addScaledVector(_spawnRight, -0.12);
  codeCube.rotation.set(0, 0, 0);
  codeCube.visible = true;

  // FBX model: slightly to the right (may be null if still loading)
  placeFbxModel();
}

// ─── Render Loop ──────────────────────────────────────────────────────────────
const clock     = new THREE.Clock();
let spawned     = false;
const _boneA    = new THREE.Vector3();
const _boneB    = new THREE.Vector3();

renderer.setAnimationLoop((_time, xrFrame) => {
  const dt = clock.getDelta();

  // Spawn objects on first real XR frame
  if (xrFrame && !spawned) { spawned = true; spawnObjects(); }

  // PICO 4 fallback: build hand visuals if joints became available without 'connected' firing
  if (xrFrame) {
    for (let i = 0; i < 2; i++) {
      if (!handData[i]) {
        const hand = renderer.xr.getHand(i);
        // Three.js populates hand.joints[name] as XRJointSpace objects once the
        // platform provides them. If wrist joint exists, the hand is being tracked.
        if (hand.joints['wrist']) {
          buildHandVisual(hand, i);
          const ray = renderer.xr.getController(i).getObjectByName('ray');
          if (ray) ray.visible = false;
        }
      }
    }
  }

  // Update hand bone lines
  for (let i = 0; i < 2; i++) {
    const data = handData[i];
    if (!data) continue;
    const hand = renderer.xr.getHand(i);
    for (const { line, a, b } of data.boneLines) {
      const jA = hand.joints[a], jB = hand.joints[b];
      if (!jA || !jB) continue;
      jA.getWorldPosition(_boneA);
      jB.getWorldPosition(_boneB);
      const pos = line.geometry.attributes.position;
      pos.setXYZ(0, _boneA.x, _boneA.y, _boneA.z);
      pos.setXYZ(1, _boneB.x, _boneB.y, _boneB.z);
      pos.needsUpdate = true;
    }

    // Pinch detection
    const thumbTip = hand.joints['thumb-tip'];
    const indexTip = hand.joints['index-finger-tip'];
    if (thumbTip && indexTip) {
      thumbTip.getWorldPosition(_tipA);
      indexTip.getWorldPosition(_tipB);
      const dist = _tipA.distanceTo(_tipB);
      const key  = `hand_${i}`;
      if (!pinching[i] && dist < PINCH_ENTER) {
        pinching[i] = true;
        tryGrab(indexTip, key, 0.12);
      } else if (pinching[i] && dist > PINCH_EXIT) {
        pinching[i] = false;
        releaseGrab(key);
      }
    }
  }

  // Idle spin on ungrabbed objects
  const grabbedTargets = new Set(
    Object.values(grabState).filter(s => s.grabbing).map(s => s.target)
  );
  if (!grabbedTargets.has(codeCube)) codeCube.rotation.y += dt * 0.5;
  if (fbxModel && !grabbedTargets.has(fbxModel)) fbxModel.rotation.y += dt * 0.7;

  // Drive grabbed objects
  for (const state of Object.values(grabState)) {
    if (!state.grabbing) continue;
    _grabMat.multiplyMatrices(state.source.matrixWorld, state.offset);
    _grabMat.decompose(_wPos, _wQuat, _wSca);
    state.target.position.copy(_wPos);
    state.target.quaternion.copy(_wQuat);
  }

  renderer.render(scene, camera);
});

// ─── WebXR check ──────────────────────────────────────────────────────────────
async function checkSupport() {
  startBtn.disabled = false;
  if (!navigator.xr) {
    statusEl.textContent = '⚠️ navigator.xr not found – use Meta Quest Browser.';
    return;
  }
  try {
    const ok = await Promise.race([
      navigator.xr.isSessionSupported('immersive-ar'),
      new Promise((_, r) => setTimeout(() => r(new Error('t/o')), 3000)),
    ]);
    if (ok && !fbxModel) statusEl.textContent = '✅ AR ready – loading FBX…';
    else if (ok)          statusEl.textContent = '✅ AR + FBX ready!';
  } catch { /* status already set */ }
}

// ─── Enter AR ─────────────────────────────────────────────────────────────────
// Request an AR session, preferring hand-tracking as required (PICO 4 needs this),
// then falling back to optional (older / controller-only devices).
async function requestARSession() {
  const configs = [
    // Try 1: hand-tracking required — PICO 4 activates hands only this way
    { requiredFeatures: ['local-floor', 'hand-tracking'],
      optionalFeatures: ['bounded-floor', 'layers'] },
    // Try 2: hand-tracking optional — Quest 3 / devices that support it but don't require it
    { requiredFeatures: ['local-floor'],
      optionalFeatures: ['bounded-floor', 'hand-tracking', 'layers'] },
  ];
  for (const cfg of configs) {
    try {
      return await navigator.xr.requestSession('immersive-ar', cfg);
    } catch (_) { /* try next config */ }
  }
  throw new Error('Could not start AR session — check device compatibility.');
}

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  statusEl.textContent = 'Starting AR session…';
  try {
    const session = await requestARSession();
    renderer.xr.setSession(session);

    overlay.classList.add('hidden');
    arHint.style.display = 'block';
    setTimeout(() => { arHint.style.display = 'none'; }, 4000);

    session.addEventListener('end', () => {
      overlay.classList.remove('hidden');
      arHint.style.display = 'none';
      startBtn.disabled    = false;
      spawned              = false;
      codeCube.visible     = false;
      codeCube.rotation.set(0, 0, 0);
      if (fbxModel) { fbxModel.visible = false; fbxModel.rotation.set(0, 0, 0); }
      for (const k in grabState) delete grabState[k];
      cubeMat.emissive?.set(0x000000);
      pinching[0] = pinching[1] = false;
      destroyHandVisual(0); destroyHandVisual(1);
      statusEl.textContent = '✅ Session ended – tap to re-enter AR.';
    });
  } catch (err) {
    console.error(err);
    statusEl.textContent = `❌ ${err.message}`;
    startBtn.disabled = false;
  }
});

checkSupport();
