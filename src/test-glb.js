import * as THREE from 'three';
import { GLTFLoader }    from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const log = s => {
  const el = document.getElementById('log');
  if (el) el.textContent = s;
  console.log(s);
};

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

const scene  = new THREE.Scene();
scene.background = new THREE.Color(0x334455);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.001, 100);
camera.position.set(0, 0.5, 2);

scene.add(new THREE.AmbientLight(0xffffff, 1.5));
const dir = new THREE.DirectionalLight(0xffffff, 2);
dir.position.set(2, 4, 3);
scene.add(dir);

scene.add(new THREE.GridHelper(4, 10, 0x666666, 0x444444));
scene.add(new THREE.AxesHelper(1));

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const loader = new GLTFLoader();
loader.load(
  './cube.glb',
  (gltf) => {
    const model = gltf.scene;

    let meshCount = 0, totalTri = 0;
    model.traverse(c => {
      if (!c.isMesh) return;
      meshCount++;
      const geo = c.geometry;
      const tris = geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
      totalTri += tris;
      console.log(`Mesh "${c.name}": verts=${geo.attributes.position.count}, tris=${tris}`);
      c.material = new THREE.MeshStandardMaterial({ color: 0x88ccff, roughness: 0.3, metalness: 0.4 });
    });

    const box  = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const centre = new THREE.Vector3();
    box.getCenter(centre);
    model.position.sub(centre);
    model.scale.setScalar(1 / Math.max(size.x, size.y, size.z));
    scene.add(model);

    log(`✅ GLB loaded!\nMeshes: ${meshCount} | Triangles: ${totalTri}\nBBox: ${size.x.toFixed(3)} x ${size.y.toFixed(3)} x ${size.z.toFixed(3)}\n\nDrag to orbit`);
  },
  undefined,
  (err) => log(`❌ Load error: ${err.message || err}`)
);

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
