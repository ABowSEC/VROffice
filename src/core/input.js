// InputManager: unifies the desktop mouse and the WebXR controllers into one
// pointer contract:  onPointerDown / onPointerMove / onPointerUp ({ ray, source, button }).
//   ray     THREE.Ray in world space
//   source  'mouse' | 'ctrl0' | 'ctrl1'
//   button  'mouse' | 'trigger' | 'grip'
// Trigger = select / drag. Grip = secondary grab (works the same as the trigger).
import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';

const HAPTICS = {
  tap: [0.3, 25],
  pickup: [0.5, 40],
  snap: [0.8, 80],
  error: [1.0, 160],
};
const DEFAULT_RAY = 1.5;

export class InputManager {
  constructor({ renderer, camera, scene, xr }) {
    this.renderer = renderer;
    this.camera = camera;
    this.handlers = { down: [], move: [], up: [] };
    /** Set by the app: ray -> distance to whatever it hits (for the ray length / reticle), or null. */
    this.distanceTo = () => null;
    /** Set by the app: does this ray hit something clickable? (decides click vs. mouse-look) */
    this.hitsInteractive = () => false;
    this.lookAround = false;
    this.controllers = [];
    this.#setupMouse();
    if (xr) this.#setupXR(scene);
  }

  onPointerDown(fn) { this.handlers.down.push(fn); }
  onPointerMove(fn) { this.handlers.move.push(fn); }
  onPointerUp(fn) { this.handlers.up.push(fn); }

  #emit(type, e) {
    for (const fn of this.handlers[type]) fn(e);
  }

  get presenting() {
    return this.renderer.xr.isPresenting;
  }

  #setupMouse() {
    const el = this.renderer.domElement;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const toEvent = (ev) => {
      const r = el.getBoundingClientRect();
      ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      this.camera.updateMatrixWorld();
      raycaster.setFromCamera(ndc, this.camera);
      return { ray: raycaster.ray.clone(), source: 'mouse', button: 'mouse' };
    };
    // Mouse look (VR page outside the headset only): drag on empty space, or right-drag anywhere.
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    let looking = false;
    el.addEventListener('pointerdown', (ev) => {
      if (this.presenting || (ev.button !== 0 && ev.button !== 2)) return;
      el.setPointerCapture(ev.pointerId);
      const e = toEvent(ev);
      if (this.lookAround && (ev.button === 2 || !this.hitsInteractive(e.ray))) {
        looking = true;
        euler.setFromQuaternion(this.camera.quaternion);
        el.style.cursor = 'grabbing';
        return;
      }
      if (ev.button === 0) this.#emit('down', e);
    });
    el.addEventListener('pointermove', (ev) => {
      if (this.presenting) return;
      if (looking) {
        euler.y += ev.movementX * 0.004;
        euler.x = THREE.MathUtils.clamp(euler.x + ev.movementY * 0.004, -1.2, 1.2);
        this.camera.quaternion.setFromEuler(euler);
        return;
      }
      this.#emit('move', toEvent(ev));
    });
    const up = (ev) => {
      if (this.presenting) return;
      if (looking) {
        looking = false;
        el.style.cursor = 'default';
        return;
      }
      if (ev.button === 0) this.#emit('up', toEvent(ev));
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', (ev) => ev.preventDefault());
  }

  #setupXR(scene) {
    const factory = new XRControllerModelFactory();
    // Thin cylinder along -z, length 1 (scaled to the hit distance each frame).
    const rayGeom = new THREE.CylinderGeometry(0.0015, 0.0015, 1, 6, 1, true);
    rayGeom.rotateX(-Math.PI / 2);
    rayGeom.translate(0, 0, -0.5);
    const rayMat = new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.85 });
    const reticleGeom = new THREE.SphereGeometry(0.006, 12, 8);
    const reticleMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false });
    this.raycaster = new THREE.Raycaster();

    for (let i = 0; i < 2; i++) {
      const c = this.renderer.xr.getController(i);
      const ray = new THREE.Mesh(rayGeom, rayMat);
      ray.scale.z = DEFAULT_RAY;
      c.add(ray);
      const reticle = new THREE.Mesh(reticleGeom, reticleMat);
      reticle.renderOrder = 999;
      reticle.visible = false;
      scene.add(reticle);
      const source = `ctrl${i}`;
      c.userData = { source, inputSource: null, ray, reticle };

      const evt = (button) => {
        this.raycaster.setFromXRController(c);
        return { ray: this.raycaster.ray.clone(), source, button };
      };
      c.addEventListener('connected', (e) => {
        c.userData.inputSource = e.data;
        ray.visible = e.data.targetRayMode === 'tracked-pointer';
      });
      c.addEventListener('disconnected', () => {
        // End any drag that was in progress with this controller.
        this.#emit('up', { ...evt('trigger') });
        this.#emit('up', { ...evt('grip') });
        c.userData.inputSource = null;
        reticle.visible = false;
      });
      c.addEventListener('selectstart', () => this.#emit('down', evt('trigger')));
      c.addEventListener('selectend', () => this.#emit('up', evt('trigger')));
      c.addEventListener('squeezestart', () => this.#emit('down', evt('grip')));
      c.addEventListener('squeezeend', () => this.#emit('up', evt('grip')));
      scene.add(c);

      const grip = this.renderer.xr.getControllerGrip(i);
      grip.add(factory.createControllerModel(grip));
      scene.add(grip);
      this.controllers.push(c);
    }
  }

  /** Call once per frame. Emits controller moves and updates the ray length and reticle. */
  update() {
    for (const c of this.controllers) {
      const { inputSource, ray, reticle, source } = c.userData;
      if (!this.presenting || !inputSource) {
        reticle.visible = false;
        continue;
      }
      this.raycaster.setFromXRController(c);
      const r = this.raycaster.ray.clone();
      this.#emit('move', { ray: r, source, button: null });
      const d = this.distanceTo(r);
      ray.scale.z = d ?? DEFAULT_RAY;
      reticle.visible = d != null;
      if (d != null) r.at(d, reticle.position);
    }
  }

  /** Haptic pulse on a controller. kind: 'tap' | 'pickup' | 'snap' | 'error'. No-op for the mouse. */
  haptic(source, kind) {
    const c = this.controllers.find((x) => x.userData.source === source);
    const actuator = c?.userData.inputSource?.gamepad?.hapticActuators?.[0];
    const [intensity, ms] = HAPTICS[kind] || HAPTICS.tap;
    try { actuator?.pulse?.(intensity, ms); } catch { /* unsupported */ }
  }
}
