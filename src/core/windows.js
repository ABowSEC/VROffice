// WindowManager: every workspace item is a plane in the Three.js scene graph,
// textured with a 2D canvas where it needs text. Provides picking (ray -> item),
// ray -> workspace-plane projection, hover/flash outlines and factories for each item type.
import * as THREE from 'three';
import { HUD, ARRANGE, ICON_SIZE, DOC_SIZE, FOLDER_SIZE, WORKSPACE, WINDOW_TITLE_H, COLORS } from './config.js';

const PX = 2000; // canvas pixels per metre
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const BORDER = 0.006; // dark window frame
let maxAnisotropy = 4;

// ---- canvas helpers ------------------------------------------------------------------

function canvasPlane(w, h, { transparent = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(4, Math.round(w * PX));
  canvas.height = Math.max(4, Math.round(h * PX));
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: texture, transparent, toneMapped: false })
  );
  const draw = (fn) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    fn(ctx, canvas.width, canvas.height);
    texture.needsUpdate = true;
  };
  return { mesh, draw };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draw single-line text, shrinking the font until it fits maxW. */
function fitText(ctx, text, x, y, maxW, size, weight = 600, align = 'left') {
  let s = size;
  do {
    ctx.font = `${weight} ${s}px ${FONT}`;
    s -= 2;
  } while (ctx.measureText(text).width > maxW && s > 10);
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
  ctx.textAlign = 'left';
}

function wrap(ctx, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxW && line) {
        out.push(line);
        line = word;
      } else line = test;
    }
    out.push(line);
  }
  return out;
}

function solid(w, h, color, opts = {}) {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, ...opts }));
}

function isVisible(o) {
  for (; o; o = o.parent) if (!o.visible) return false;
  return true;
}

function disposeTree(root) {
  root.traverse((o) => {
    o.geometry?.dispose();
    const m = o.material;
    if (m) {
      m.map?.dispose();
      m.dispose();
    }
  });
}

/**
 * Outline plane behind an item; shows hover (blue), highlight (drop target) or a short flash (red / green).
 */
function addOutline(mesh, w, h, pad = 0.008) {
  const outline = solid(w + 2 * pad, h + 2 * pad, COLORS.hover);
  outline.position.z = -0.001;
  outline.visible = false;
  mesh.add(outline);
  const st = { hovered: false, highlighted: false, flash: null, flashTimer: 0 };
  const refresh = () => {
    const color = st.flash || (st.highlighted ? COLORS.success : st.hovered ? COLORS.hover : null);
    outline.visible = !!color;
    if (color) outline.material.color.set(color);
  };
  mesh.userData.setHover = (v) => { st.hovered = v; refresh(); };
  mesh.userData.setHighlight = (v) => { st.highlighted = v; refresh(); };
  mesh.userData.flash = (color, ms = 350) => {
    st.flash = color;
    refresh();
    clearTimeout(st.flashTimer);
    st.flashTimer = setTimeout(() => { st.flash = null; refresh(); }, ms);
  };
}

// File-type colours for icons.
const EXT_COLORS = {
  docx: '#2b5fb4', xlsx: '#1f8a4c', pdf: '#c8352d', pptx: '#d2691e', txt: '#6b7480',
  png: '#8a4fb3', jpg: '#8a4fb3', csv: '#178f8f', zip: '#8a6a3a', mp3: '#c2407a', mp4: '#c2407a',
};
const extColor = (name) => EXT_COLORS[name.split('.').pop()] || '#6b7480';

/** Old-style button: light with border, or primary blue / selected yellow. */
function drawButton(ctx, W, H, { label, style = 'normal', hover = false, align = 'center', bg = COLORS.hudBg }) {
  let fill = COLORS.btn, text = COLORS.text, border = COLORS.btnBorder;
  if (style === 'primary') { fill = COLORS.accent; text = '#fff'; border = COLORS.accent; }
  if (style === 'selected') { fill = COLORS.selected; border = '#9c7c00'; }
  if (hover) {
    border = '#1d5fa8';
    if (style === 'normal') fill = '#cfe3ff';
    if (style === 'primary') fill = '#245a94';
  }
  ctx.fillStyle = bg; // match what's behind the rounded corners
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = fill;
  roundRect(ctx, 4, 4, W - 8, H - 8, 18);
  ctx.fill();
  ctx.lineWidth = hover ? 10 : 5;
  ctx.strokeStyle = border;
  ctx.stroke();
  ctx.fillStyle = text;
  ctx.textBaseline = 'middle';
  const weight = style === 'normal' ? 500 : 700;
  if (align === 'center') fitText(ctx, label, W / 2, H / 2 + 2, W - 30, 46, weight, 'center');
  else fitText(ctx, label, 28, H / 2 + 2, W - 56, 42, weight);
}

// ---- WindowManager --------------------------------------------------------------------

export class WindowManager {
  constructor(workspace, { anisotropy = 4 } = {}) {
    maxAnisotropy = anisotropy;
    this.workspace = workspace;
    this.layer = new THREE.Group(); // per-trial items; cleared between trials
    workspace.add(this.layer);
    this.interactives = new Set();
    this.hovered = new Set();
    this.raycaster = new THREE.Raycaster();
    this.hud = new Hud(this);
  }

  /** Mark an object as pickable. hit = { kind, id, ... }. */
  register(obj, hit) {
    obj.userData.hit = hit;
    this.interactives.add(obj);
    return obj;
  }

  clearLayer() {
    this.layer.traverse((o) => { this.interactives.delete(o); this.hovered.delete(o); });
    for (const child of [...this.layer.children]) {
      this.layer.remove(child);
      disposeTree(child);
    }
  }

  /** Nearest visible interactive object hit by a world-space ray. */
  pick(ray) {
    this.raycaster.ray.copy(ray);
    const objs = [...this.interactives].filter(isVisible);
    const h = this.raycaster.intersectObjects(objs, false)[0];
    return h ? { object: h.object, hit: h.object.userData.hit, distance: h.distance, point: h.point } : null;
  }

  /** Intersect a ray with the workspace plane. Returns { local: Vector3 (workspace coords), distance } or null. */
  rayToPlane(ray) {
    this.workspace.updateWorldMatrix(true, false);
    const normal = new THREE.Vector3(0, 0, 1).transformDirection(this.workspace.matrixWorld);
    const origin = new THREE.Vector3().setFromMatrixPosition(this.workspace.matrixWorld);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, origin);
    const p = ray.intersectPlane(plane, new THREE.Vector3());
    if (!p) return null;
    return { distance: ray.origin.distanceTo(p), local: this.workspace.worldToLocal(p) };
  }

  /** Distance used for the VR ray length/reticle: an item, or the workspace surface. */
  rayDistance(ray) {
    const hit = this.pick(ray);
    if (hit) return hit.distance;
    const p = this.rayToPlane(ray);
    if (p && Math.abs(p.local.x) <= WORKSPACE.width / 2 && Math.abs(p.local.y) <= WORKSPACE.height / 2) return p.distance;
    return null;
  }

  setHovered(objs) {
    for (const o of this.hovered) if (!objs.has(o)) o.userData.setHover?.(false);
    for (const o of objs) if (!this.hovered.has(o)) o.userData.setHover?.(true);
    this.hovered = objs;
  }

  // ---- factories (all added to the per-trial layer) ----

  addIcon({ id, name, x, y }) {
    const s = ICON_SIZE;
    const { mesh, draw } = canvasPlane(s, s);
    draw((ctx, W, H) => {
      ctx.fillStyle = COLORS.surface;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, 4, 4, W - 8, H - 8, 24);
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#b8c2cc';
      ctx.stroke();
      // file glyph
      const gw = W * 0.38, gh = H * 0.46, gx = (W - gw) / 2, gy = H * 0.1, fold = gw * 0.3;
      ctx.fillStyle = extColor(name);
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx + gw - fold, gy);
      ctx.lineTo(gx + gw, gy + fold);
      ctx.lineTo(gx + gw, gy + gh);
      ctx.lineTo(gx, gy + gh);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff';
      fitText(ctx, name.split('.').pop().toUpperCase(), W / 2, gy + gh * 0.72, gw - 10, 40, 800, 'center');
      ctx.fillStyle = COLORS.text;
      ctx.textBaseline = 'alphabetic';
      fitText(ctx, name, W / 2, H * 0.84, W - 24, 42, 600, 'center');
    });
    mesh.position.set(x, y, 0.002);
    addOutline(mesh, s, s);
    this.layer.add(mesh);
    return this.register(mesh, { kind: 'icon', id });
  }

  addDocument({ id, name, x, y }) {
    const { w, h } = DOC_SIZE;
    const { mesh, draw } = canvasPlane(w, h);
    draw((ctx, W, H) => {
      ctx.fillStyle = COLORS.paper;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = extColor(name);
      ctx.fillRect(0, 0, W, H * 0.2);
      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'middle';
      fitText(ctx, name, W / 2, H * 0.1, W - 20, 34, 700, 'center');
      ctx.fillStyle = '#c3cad2';
      for (let i = 0; i < 7; i++) ctx.fillRect(20, H * 0.28 + i * H * 0.09, (W - 40) * (i % 3 === 2 ? 0.6 : 1), 8);
      ctx.lineWidth = 6;
      ctx.strokeStyle = COLORS.frame;
      ctx.strokeRect(3, 3, W - 6, H - 6);
    });
    mesh.position.set(x, y, 0.004);
    addOutline(mesh, w, h);
    this.layer.add(mesh);
    return this.register(mesh, { kind: 'document', id });
  }

  addFolder({ id, label, color, x, y }) {
    const { w, h } = FOLDER_SIZE;
    const { mesh, draw } = canvasPlane(w, h, { transparent: true });
    draw((ctx, W, H) => {
      ctx.fillStyle = color;
      roundRect(ctx, 0, 0, W * 0.45, H * 0.25, 16); // tab
      ctx.fill();
      roundRect(ctx, 0, H * 0.12, W, H * 0.88, 18);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'middle';
      fitText(ctx, label, W / 2, H * 0.58, W - 30, 54, 700, 'center');
    });
    mesh.position.set(x, y, 0.002);
    addOutline(mesh, w, h, 0.012);
    this.layer.add(mesh);
    // Folders are drop targets, not click targets: not registered as pickable.
    return mesh;
  }

  /**
   * A window with a blue title bar (drag to move).
   *   resizable: adds 4 corner handles + 4 edge strips (drag to resize, opposite side stays put)
   *   content:   (ctx, W, H) => void draws a fixed-size body (non-resizable windows only)
   */
  addWindow({ id, title, w = 0.3, h = 0.2, resizable = false, content = null }) {
    const T = WINDOW_TITLE_H;
    const group = new THREE.Group();
    const frame = solid(1, 1, COLORS.frame);
    let body, bodyCanvas = null;
    if (content) {
      bodyCanvas = canvasPlane(w, h - T);
      bodyCanvas.draw((ctx, W, H) => {
        ctx.fillStyle = COLORS.windowBody;
        ctx.fillRect(0, 0, W, H);
        content(ctx, W, H);
      });
      body = bodyCanvas.mesh;
    } else {
      body = solid(1, 1, COLORS.windowBody);
    }
    body.position.z = 0.0005;
    const bar = solid(1, 1, COLORS.titleBar);
    // Resizable windows can shrink, so keep their title label short and clear of the corner grips.
    const labelW = resizable ? 0.13 : Math.min(w - 0.02, 0.5);
    const labelInset = resizable ? ARRANGE.handle : 0.004;
    const label = canvasPlane(labelW, T, { transparent: true });
    label.draw((ctx, W, H) => {
      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'middle';
      fitText(ctx, title, 16, H / 2 + 2, W - 24, 50, 600);
    });
    group.add(frame, body, bar, label.mesh);
    this.layer.add(group);

    bar.userData.setHover = (v) => bar.material.color.set(v ? COLORS.titleHover : COLORS.titleBar);
    this.register(bar, { kind: 'title', id });
    this.register(body, { kind: 'window_body', id });

    // Resize grips: corners [mx, my] (+1 = right/top edge moves, -1 = left/bottom edge moves).
    const grips = [];
    if (resizable) {
      const corners = [[1, -1, 0], [1, 1, Math.PI / 2], [-1, 1, Math.PI], [-1, -1, -Math.PI / 2]];
      for (const [mx, my, rot] of corners) {
        // Slim L-shaped bracket hugging the corner (drawn for the bottom-right corner, then rotated).
        const c = canvasPlane(ARRANGE.handle, ARRANGE.handle, { transparent: true });
        const draw = (hover) => c.draw((ctx, W, H) => {
          if (hover) {
            ctx.fillStyle = 'rgba(255, 208, 96, 0.45)';
            ctx.fillRect(0, 0, W, H);
          }
          const t = hover ? 22 : 15;
          ctx.strokeStyle = hover ? COLORS.handleHover : COLORS.handle;
          ctx.lineWidth = t;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(W * 0.12, H - t / 2);
          ctx.lineTo(W - t / 2, H - t / 2);
          ctx.lineTo(W - t / 2, H * 0.12);
          ctx.stroke();
        });
        draw(false);
        c.mesh.rotation.z = rot;
        c.mesh.userData.setHover = draw;
        group.add(c.mesh);
        this.register(c.mesh, { kind: 'resize', id, mx, my });
        grips.push({ mesh: c.mesh, mx, my, corner: true });
      }
      for (const [mx, my] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        // Invisible grab strip along the edge; lights up on hover.
        const e = solid(1, 1, COLORS.edgeHover, { transparent: true, opacity: 0, depthWrite: false });
        e.userData.setHover = (v) => (e.material.opacity = v ? 0.85 : 0);
        group.add(e);
        this.register(e, { kind: 'resize', id, mx, my });
        grips.push({ mesh: e, mx, my, corner: false });
      }
    }

    const rect = { cx: 0, cy: 0, w, h };
    const win = {
      id,
      group,
      rect,
      setRect(cx, cy, nw, nh) {
        Object.assign(rect, { cx, cy, w: nw, h: nh });
        group.position.set(cx, cy, 0.004);
        frame.scale.set(nw + 2 * BORDER, nh + 2 * BORDER, 1);
        if (!bodyCanvas) body.scale.set(nw, nh, 1);
        else body.position.set(0, -T / 2, 0.0005);
        bar.scale.set(nw, T, 1);
        bar.position.set(0, nh / 2 - T / 2, 0.001);
        label.mesh.position.set(-nw / 2 + labelW / 2 + labelInset, nh / 2 - T / 2, 0.002);
        const E = ARRANGE.edge, Hd = ARRANGE.handle;
        for (const g of grips) {
          if (g.corner) {
            g.mesh.position.set(g.mx * (nw / 2 - Hd / 2 + BORDER), g.my * (nh / 2 - Hd / 2 + BORDER), 0.004);
          } else if (g.mx) {
            g.mesh.scale.set(E, nh - 2 * Hd, 1);
            g.mesh.position.set(g.mx * nw / 2, 0, 0.003);
          } else {
            g.mesh.scale.set(nw - 2 * Hd, E, 1);
            g.mesh.position.set(0, g.my * nh / 2, 0.003);
          }
        }
      },
      flash(color) {
        if (bodyCanvas) return;
        body.material.color.set(color);
        setTimeout(() => body.material.color.set(COLORS.windowBody), 350);
      },
    };
    win.setRect(0, 0, w, h);
    return win;
  }

  /** Clickable button in the task layer (e.g. answer choices). Returns the mesh; mesh.userData.setStyle(style). */
  addButton({ id, kind = 'choice', label, x, y, w, h, style = 'normal', align = 'left', bg = COLORS.windowBody }) {
    const b = canvasPlane(w, h);
    const st = { label, style, hover: false, align, bg };
    const redraw = () => b.draw((ctx, W, H) => drawButton(ctx, W, H, st));
    b.mesh.userData.setHover = (v) => { st.hover = v; redraw(); };
    b.mesh.userData.setStyle = (s) => { st.style = s; redraw(); };
    redraw();
    b.mesh.position.set(x, y, 0.002);
    return this.register(b.mesh, { kind, id });
  }

  /** Ghost target: translucent fill plus an outline drawn on top of everything so it stays visible under the window. */
  addGhost({ cx, cy, w, h }) {
    const group = new THREE.Group();
    const fill = solid(w, h, COLORS.ghost, { transparent: true, opacity: 0.15, depthWrite: false });
    group.add(fill);
    const t = 0.004;
    const lineMat = new THREE.MeshBasicMaterial({ color: COLORS.ghost, transparent: true, opacity: 0.95, depthTest: false });
    const strips = [
      [w + t, t, 0, h / 2], [w + t, t, 0, -h / 2],
      [t, h + t, -w / 2, 0], [t, h + t, w / 2, 0],
    ];
    for (const [sw, sh, x, y] of strips) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), lineMat);
      m.position.set(x, y, 0.0005); // same plane as the fill; depthTest off keeps it on top
      m.renderOrder = 10;
      group.add(m);
    }
    group.position.set(cx, cy, 0.001);
    this.layer.add(group);
    return group;
  }
}

/** Draw a document (title + lines, wrapped) into a window body canvas. */
export function drawDocument(ctx, W, H, doc, fontM) {
  const size = Math.round(fontM * PX);
  const pad = Math.round(0.014 * PX);
  let y = pad;
  ctx.textBaseline = 'top';
  ctx.fillStyle = COLORS.text;
  ctx.font = `700 ${Math.round(size * 1.12)}px ${FONT}`;
  for (const line of wrap(ctx, doc.title, W - 2 * pad)) {
    ctx.fillText(line, pad, y);
    y += size * 1.45;
  }
  y += size * 0.3;
  ctx.font = `400 ${size}px ${FONT}`;
  for (const raw of doc.lines) {
    if (!raw) { y += size * 0.6; continue; }
    const lines = wrap(ctx, raw, W - 2 * pad);
    lines.forEach((line, i) => {
      ctx.fillText(line, pad + (i ? size : 0), y);
      y += size * 1.32;
    });
  }
}

// ---- HUD: "Task Panel" window across the top, with up to 3 buttons ----------------------

class Hud {
  constructor(wm) {
    this.group = new THREE.Group();
    this.group.position.set(0, HUD.cy, 0.002);
    wm.workspace.add(this.group);

    const frame = solid(HUD.width + 2 * BORDER, HUD.height + 2 * BORDER, COLORS.frame);
    frame.position.z = -0.001;
    this.group.add(frame);
    this.bg = canvasPlane(HUD.width, HUD.height);
    this.group.add(this.bg.mesh);
    wm.register(this.bg.mesh, { kind: 'hud' });

    const bodyCy = -HUD.titleH / 2; // centre of the area under the title bar
    this.buttons = [0, 1, 2].map((i) => {
      const b = canvasPlane(HUD.btnW, HUD.btnH);
      b.mesh.position.set(HUD.width / 2 - 0.015 - HUD.btnW / 2 - i * (HUD.btnW + 0.012), bodyCy, 0.002);
      b.mesh.visible = false;
      b.state = { label: '', style: 'normal', hover: false };
      b.redraw = () => b.draw((ctx, W, H) => drawButton(ctx, W, H, b.state));
      b.mesh.userData.setHover = (v) => { b.state.hover = v; b.redraw(); };
      this.group.add(b.mesh);
      wm.register(b.mesh, { kind: 'button', id: null });
      return b;
    });
    this.state = { title: '', body: '', tone: 'normal' };
    this.nButtons = 0;
  }

  /**
   * @param {{title: string, body: string, tone?: 'normal'|'success'|'error', buttons?: {id,label,style?}[]}} s
   * buttons are laid out right-to-left: the first one is rightmost.
   */
  set({ title, body, tone = 'normal', buttons = [] }) {
    this.state = { title, body, tone };
    this.buttons.forEach((b, i) => {
      const spec = buttons[i];
      b.mesh.visible = !!spec;
      if (!spec) return;
      b.mesh.userData.hit.id = spec.id;
      b.state.label = spec.label;
      b.state.style = spec.style || 'normal';
      b.redraw();
    });
    this.nButtons = buttons.length;
    this.#drawBg();
  }

  /** Change only the body text (e.g. "Not aligned yet"). */
  message(body, tone = 'normal') {
    this.state.body = body;
    this.state.tone = tone;
    this.#drawBg();
  }

  #drawBg() {
    const { title, body, tone } = this.state;
    const textW = (HUD.width - 0.03 - this.nButtons * (HUD.btnW + 0.012)) * PX;
    const T = HUD.titleH * PX;
    this.bg.draw((ctx, W, H) => {
      ctx.fillStyle = COLORS.hudBg;
      ctx.fillRect(0, 0, W, H);
      // title bar, like the other windows
      ctx.fillStyle = tone === 'success' ? COLORS.success : tone === 'error' ? COLORS.error : COLORS.titleBar;
      ctx.fillRect(0, 0, W, T);
      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'middle';
      fitText(ctx, 'Task Panel', 30, T / 2 + 2, 600, 46, 600);
      ctx.textBaseline = 'top';
      ctx.fillStyle = COLORS.text;
      fitText(ctx, title, 30, T + 18, textW - 30, 56, 700);
      ctx.font = `400 46px ${FONT}`;
      ctx.fillStyle = tone === 'error' ? COLORS.error : '#333a42';
      wrap(ctx, body, textW - 30).slice(0, 3).forEach((line, i) => ctx.fillText(line, 30, T + 90 + i * 56));
    });
  }
}
