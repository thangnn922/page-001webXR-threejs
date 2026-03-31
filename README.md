# WebXR AR Demo — Two Grabbable Cubes + Hand Tracking

> **Live demo:** https://thangnn922.github.io/page-001webXR-threejs/
> **Device:** Meta Quest 3 · Browser: Meta Quest Browser (Chromium 144)

---

## 🎯 Project Target

Build a production-ready **WebXR Augmented Reality** experience that runs directly in the headset browser — no app install, no native SDK — demonstrating:

- Real-time **AR passthrough** with virtual objects anchored in physical space
- **Two distinct 3D objects** rendered side-by-side: one built from code, one loaded from an external 3D asset file
- **Hand tracking** rendered in the XR world with full joint skeleton
- **Grab interaction** using both hand controllers (trigger) and bare hands (pinch gesture)
- A complete **local dev → GitHub Pages deploy** workflow

---

## 🖥️ Live Demo

Open on your **Meta Quest 3** browser:

```
https://thangnn922.github.io/page-001webXR-threejs/
```

Or serve locally:

```bash
npm install
npm run build
npm start
# → http://localhost:8883
# Then: adb reverse tcp:8883 tcp:8883
```

---

## ✨ Features

### AR Scene
| Feature | Detail |
|---|---|
| **Passthrough** | `immersive-ar` session, `alpha: true` renderer, fully transparent background |
| **Cube spawn** | Objects appear 55 cm in front of the user at desk height on session start |
| **Idle animation** | White cube spins at 0.5 rad/s · FBX cube at 0.7 rad/s when not held |

### Object 1 — Code Cube (White)
- Built with `THREE.BoxGeometry` (10 cm)
- `MeshStandardMaterial` white + wireframe overlay for visibility against bright backgrounds
- Emissive highlight on grab

### Object 2 — FBX Cube (Blue Metallic)
- Source: `cube.fbx` (Blender ASCII FBX 6.1 export)
- Converted to GLTF 2.0 binary (`.glb`) via custom Node.js converter (`tools/fbx2glb.js`)
- Loaded at runtime with `GLTFLoader`
- Blue metallic `MeshStandardMaterial` (color `#88ccff`, metalness 0.4)
- Validated with `gltf-validator` before every push — **0 errors, 0 warnings**

### Hand Tracking
- Manual 25-joint sphere rendering (skin tone `#ffccaa`) — no external model factory, no CDN
- 27 bone connection lines updated every frame
- **Pinch-to-grab**: measures `thumb-tip ↔ index-finger-tip` distance (enter 3 cm / exit 4.5 cm hysteresis)
- Controller ray hides while hands are active, restores on disconnect

### Grab System
- Both **controllers** (trigger button) and **bare hands** (pinch) supported simultaneously
- Independent grab per hand/controller — each can hold a different object
- Grab offset matrix preserves the exact pick-up point (no snapping to origin)
- Closest object within radius wins: 20 cm for controller · 10 cm for hand pinch

---

## 🛠️ Technical Stack

| Layer | Technology |
|---|---|
| **3D Engine** | [Three.js r183](https://threejs.org/) |
| **XR API** | [WebXR Device API](https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API) — `immersive-ar`, `local-floor`, `hand-tracking` |
| **Bundler** | [esbuild](https://esbuild.github.io/) — resolves bare `import 'three'` specifiers for Quest browser (no importmap needed) |
| **Dev server** | [http-server](https://github.com/http-party/http-server) on port 8883 |
| **Device bridge** | ADB reverse `tcp:8883 tcp:8883` |
| **Hosting** | GitHub Pages (HTTPS — required for WebXR) |
| **Validation** | [gltf-validator](https://github.com/KhronosGroup/glTF-Validator) |

---

## 📁 Project Structure

```
.
├── index.html              # HTML shell — loads dist/bundle.js
├── cube.fbx                # Source: Blender ASCII FBX 6.1
├── cube.glb                # Converted GLTF 2.0 binary (loaded at runtime)
├── test-glb.html           # Local GLB viewer for QA (orbit + stats)
│
├── src/
│   ├── main.js             # Full AR application source
│   └── test-glb.js         # GLB test viewer source
│
├── dist/
│   ├── bundle.js           # Bundled app (esbuild output)
│   └── test-glb.js         # Bundled test viewer
│
└── tools/
    ├── fbx2glb.js          # ASCII FBX 6.x → GLB converter
    ├── validate-glb.js     # gltf-validator pre-push check
    └── screenshot-test.js  # Puppeteer visual test helper
```

---

## 🚀 Development Workflow

```bash
# 1. Install dependencies
npm install

# 2. Validate GLB asset (runs automatically before deploy)
npm test

# 3. Build the bundle
npm run build

# 4. Start local server
npm start          # http://localhost:8883

# 5. Bridge to Quest 3
adb reverse tcp:8883 tcp:8883

# 6. Open on Quest browser
# → http://localhost:8883

# 7. Watch mode (auto-rebuild on save)
npm run watch

# 8. Preview GLB locally
# → http://localhost:8883/test-glb.html
```

---

## 🔧 FBX → GLB Conversion

The source file `cube.fbx` is an ASCII FBX 6.1 format exported from Blender 2.64.
`THREE.FBXLoader` only supports binary FBX 7.x, so a custom converter was written:

```
cube.fbx  (ASCII FBX 6.1, Blender export)
  ↓  node tools/fbx2glb.js cube.fbx cube.glb
cube.glb  (GLTF 2.0 binary — 736 bytes, 8 verts, 12 tris)
```

Converter features:
- Parses vertices + polygon indices from ASCII FBX text
- Handles FBX Z-up → GLTF Y-up coordinate system flip
- Fan-triangulates quad faces → triangles
- Writes spec-compliant GLB (with correct `bufferView.target` values)

---

## 🐛 Known Issues Fixed

| Issue | Root Cause | Fix |
|---|---|---|
| Page stuck on "Loading…" | Quest Browser doesn't support `<script type="importmap">` | Removed importmap; bundled with esbuild |
| Cube spawned at floor level | `camera` object stays at origin in XR; must use `renderer.xr.getCamera()` | Switched to XR camera for world position |
| FBX cube invisible (geometry corrupted) | GLB binary packed `[posBuf, idxBuf]` but bufferViews pointed opposite | Fixed buffer order to `[idxBuf, posBuf]` |
| FBX cube invisible (race condition) | `spawnObjects()` ran before GLB loaded; `fbxModel` was null | Store spawn vectors; call `placeFbxModel()` from load callback |
| Page stuck after reload | ES module cached by Quest browser | `?v=timestamp` cache-bust on module URL |
| Crash on hand connect/disconnect | `getObjectByName('ray')` returns null before controller initialised | Added null guard |

---

## 📱 Requirements

- **Meta Quest 3** (or any WebXR AR-capable device)
- **Meta Quest Browser** (or Chromium-based browser with WebXR support)
- Enable **Hand Tracking** in Quest settings: *Settings → Movement Tracking → Hand Tracking*

---

## 📄 License

MIT
