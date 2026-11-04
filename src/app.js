// Main loop, shared by both conditions. mode: 'desktop' | 'vr'.
// Scene -> InputManager / WindowManager / TaskManager -> Logger
import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import './app.css';
import { createScene } from './core/scene.js';
import { InputManager } from './core/input.js';
import { WindowManager } from './core/windows.js';
import { TaskManager } from './core/tasks.js';
import { WORKSPACE, CONDITIONS, CONDITION_LABELS } from './core/config.js';
import { readConditionParams } from './shared/session.js';
import { downloadResultsCSV } from './shared/logger.js';

export function startExperiment(mode) {
  const xr = mode === 'vr';
  const condition = xr ? CONDITIONS.vr : CONDITIONS.desktop;
  const { pid, setId, orderIndex, testMode } = readConditionParams();

  const { renderer, scene, camera, rig, workspace } = createScene({ xr });
  const wm = new WindowManager(workspace, { anisotropy: renderer.capabilities.getMaxAnisotropy() });
  const input = new InputManager({ renderer, camera, scene, xr });
  input.distanceTo = (ray) => wm.rayDistance(ray);
  // VR page without a headset: drag empty space (or right-drag) to look around, like the old fallback.
  input.lookAround = xr;
  input.hitsInteractive = (ray) => {
    const k = wm.pick(ray)?.hit.kind;
    return !!k && k !== 'hud' && k !== 'window_body';
  };

  const downloadMine = () => downloadResultsCSV({ pid, condition });
  let blockDone = false;
  let autoDownloaded = false;

  const tasks = new TaskManager({
    wm,
    input,
    participantId: pid,
    condition,
    setId,
    orderIndex,
    extraButtons: (state) => {
      if (state === 'done') {
        return renderer.xr.isPresenting ? [{ id: 'exit', label: 'Exit VR' }] : [{ id: 'download', label: 'Download CSV' }];
      }
      const extra = renderer.xr.isPresenting ? [{ id: 'recenter', label: 'Recenter' }] : [];
      // Test mode only: skip the current trial (not logged). Hidden during the short feedback pause.
      if (testMode && state !== 'feedback') extra.push({ id: 'skip', label: 'Skip (test)' });
      return extra;
    },
    onExtraButton: (id) => {
      if (id === 'recenter') recenter();
      else if (id === 'exit') renderer.xr.getSession()?.end();
      else if (id === 'download') downloadMine();
    },
    onBlockDone: () => {
      blockDone = true;
      document.body.classList.add('done');
      if (!renderer.xr.isPresenting) {
        autoDownloaded = true;
        downloadMine();
      }
    },
    onCursor: (c) => (renderer.domElement.style.cursor = c),
  });

  window.__vo = { tasks, wm }; // debug / automated testing
  input.onPointerDown((e) => tasks.pointerDown(e));
  input.onPointerMove((e) => tasks.pointerMove(e));
  input.onPointerUp((e) => tasks.pointerUp(e));

  // ---- VR: recenter the rig on the user's head (yaw + eye height) ----
  function recenter() {
    const cam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
    const pos = new THREE.Vector3();
    const dir = new THREE.Vector3();
    cam.getWorldPosition(pos);
    cam.getWorldDirection(dir);
    rig.rotation.y = Math.atan2(-dir.x, -dir.z);
    rig.position.set(pos.x, pos.y - WORKSPACE.y, pos.z);
  }

  let framesSinceStart = -1;
  if (xr) {
    document.body.appendChild(VRButton.createButton(renderer));
    renderer.xr.addEventListener('sessionstart', () => {
      framesSinceStart = 0;
      tasks.refreshHud();
    });
    renderer.xr.addEventListener('sessionend', () => {
      framesSinceStart = -1;
      rig.position.set(0, 0, 0);
      rig.rotation.set(0, 0, 0);
      tasks.refreshHud();
      if (blockDone && !autoDownloaded) {
        autoDownloaded = true;
        downloadMine();
      }
    });
  }

  renderer.setAnimationLoop(() => {
    // Wait a few frames for a valid head pose, then place the workspace in front of the user.
    if (framesSinceStart >= 0 && ++framesSinceStart === 3) recenter();
    input.update();
    tasks.update();
    renderer.render(scene, camera);
  });

  // ---- HTML overlay (outside immersive mode) ----
  const info = document.getElementById('info');
  if (info) info.textContent = `${pid} · ${CONDITION_LABELS[condition]} · layout set ${setId} · block ${orderIndex}${testMode ? ' · TEST MODE' : ''}`;
  document.getElementById('download')?.addEventListener('click', downloadMine);

  // Minimize toggle: collapses the overlay to a small pill (remembered per device).
  const overlay = document.getElementById('overlay');
  if (overlay) {
    const toggle = document.createElement('button');
    toggle.className = 'overlay-toggle';
    overlay.prepend(toggle);
    const setMin = (min) => {
      overlay.classList.toggle('min', min);
      toggle.textContent = min ? (testMode ? 'ⓘ TEST' : 'ⓘ') : '–';
      toggle.title = min ? 'Show info' : 'Minimize';
      try { localStorage.setItem('overlayMin', min ? '1' : '0'); } catch {}
    };
    let startMin = false;
    try { startMin = localStorage.getItem('overlayMin') === '1'; } catch {}
    setMin(startMin);
    toggle.addEventListener('click', () => setMin(!overlay.classList.contains('min')));
  }
}
