// Scene setup shared by both conditions: renderer, camera, lights, office rig and the workspace plane.
import * as THREE from 'three';
import { WORKSPACE, DESK_Y, COLORS } from './config.js';

export function createScene({ xr }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (xr) {
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local-floor');
    renderer.xr.setFoveation(0); // foveation blurs the periphery, which hurts text
  }
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.sky);

  // Seated eye position, looking straight at the workspace (-z).
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.05, 50);
  camera.position.set(0, WORKSPACE.y, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(1, 3, 2);
  scene.add(sun);

  // Everything the user sits in front of lives in the rig, so VR recentering moves it all together.
  const rig = new THREE.Group();
  scene.add(rig);
  buildRoom(rig);

  const workspace = new THREE.Group();
  workspace.position.set(0, WORKSPACE.y, WORKSPACE.z);
  rig.add(workspace);

  const frame = new THREE.Mesh(
    new THREE.PlaneGeometry(WORKSPACE.width + 0.03, WORKSPACE.height + 0.03),
    new THREE.MeshBasicMaterial({ color: COLORS.frame })
  );
  frame.position.z = -0.006;
  const surface = new THREE.Mesh(
    new THREE.PlaneGeometry(WORKSPACE.width, WORKSPACE.height),
    new THREE.MeshBasicMaterial({ color: COLORS.surface })
  );
  surface.position.z = -0.004;
  workspace.add(frame, surface);

  /** Desktop view: frame the workspace so it fills the browser window like a monitor. */
  function fitCamera() {
    const aspect = window.innerWidth / window.innerHeight;
    const dist = -WORKSPACE.z;
    const halfH = Math.max(WORKSPACE.height / 2 + 0.025, (WORKSPACE.width / 2 + 0.025) / aspect);
    camera.aspect = aspect;
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(halfH / dist));
    camera.updateProjectionMatrix();
  }
  fitCamera();

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    fitCamera();
  });

  return { renderer, scene, camera, rig, workspace };
}

function buildRoom(rig) {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 10),
    new THREE.MeshLambertMaterial({ color: 0x8a8f96 })
  );
  floor.rotation.x = -Math.PI / 2;
  rig.add(floor);
  const grid = new THREE.GridHelper(10, 20, 0x6d737a, 0x7b8188);
  grid.position.y = 0.001;
  rig.add(grid);

  const wall = new THREE.Mesh(new THREE.PlaneGeometry(10, 3.2), new THREE.MeshLambertMaterial({ color: 0xe6e9ec }));
  wall.position.set(0, 1.6, -3);
  rig.add(wall);

  const deskMat = new THREE.MeshLambertMaterial({ color: 0x8b6b4a });
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.04, 0.6), deskMat);
  top.position.set(0, DESK_Y - 0.02, -0.55);
  rig.add(top);
  const legGeom = new THREE.BoxGeometry(0.05, DESK_Y - 0.04, 0.05);
  for (const [x, z] of [[-0.7, -0.3], [0.7, -0.3], [-0.7, -0.8], [0.7, -0.8]]) {
    const leg = new THREE.Mesh(legGeom, deskMat);
    leg.position.set(x, (DESK_Y - 0.04) / 2, z);
    rig.add(leg);
  }
}
