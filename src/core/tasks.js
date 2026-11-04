// TaskManager: trial sequencing, per-task interaction rules, scoring and logging.
// Identical in both conditions; only the InputManager's ray source differs.
//
// States: 'ready' (instructions + Start) -> 'running' -> 'feedback' (~1 s) -> next trial ... -> 'done'
//
// Error triggers (design doc):
//   selection       selecting a wrong (distractor) file
//   drag_drop       releasing the document outside the target folder (on a distractor or empty space)
//   arrange_resize  pressing Submit while outside the tolerance (centre <= 5 cm, size <= 10 %; see ARRANGE in config.js)
//   reading         (first version) changing an already-selected answer, or Submit with no answer.
//                   task_success = the submitted answer is correct.
import { buildTrials, alignmentError } from './trials.js';
import {
  ARRANGE, TASK_AREA, DOC_SIZE, FOLDER_SIZE, DRAG_MIN_MOVE, TRIAL_TIMEOUT_SEC, FEEDBACK_MS,
  TASK_LABELS, COLORS, READING,
} from './config.js';
import { drawDocument } from './windows.js';
import { addResult } from '../shared/logger.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export class TaskManager {
  /**
   * @param {object} o
   * @param {import('./windows.js').WindowManager} o.wm
   * @param {import('./input.js').InputManager} o.input
   * @param {string} o.participantId
   * @param {'desktop'|'vr_quest2'} o.condition
   * @param {'A'|'B'} o.setId
   * @param {number} o.orderIndex
   * @param {(state: string) => {id,label,style?}[]} o.extraButtons  app-level HUD buttons (Recenter, Exit VR, ...)
   * @param {(id: string) => void} o.onExtraButton
   * @param {() => void} o.onBlockDone
   * @param {(cursor: string) => void} o.onCursor  desktop mouse cursor
   */
  constructor(o) {
    Object.assign(this, o);
    this.trials = buildTrials(o.setId);
    this.i = 0;
    this.drag = null;
    this.hoverBySource = new Map();
    this.#enterReady();
  }

  get trial() {
    return this.trials[this.i];
  }

  #trialLabel(t) {
    return `${TASK_LABELS[t.type]} | ${t.practice ? 'Practice (not scored)' : `Trial ${t.index} of 3`}`;
  }

  #hud(title, body, buttons, tone) {
    this.wm.hud.set({ title, body, tone, buttons: [...buttons, ...this.extraButtons(this.state)] });
  }

  /** Re-render the HUD buttons (e.g. when entering/leaving XR changes the extra buttons). */
  refreshHud() {
    this.hudRefresh?.();
  }

  // ---- state transitions -------------------------------------------------------------

  #enterReady() {
    this.state = 'ready';
    this.drag = null;
    this.wm.clearLayer();
    this.hoverBySource.clear();
    const t = this.trial;
    this.hudRefresh = () => this.#hud(this.#trialLabel(t), `${t.instruction} Press Start when ready; the timer starts when you press Start.`, [
      { id: 'start', label: 'Start', style: 'primary' },
    ]);
    this.hudRefresh();
  }

  #start() {
    const t = this.trial;
    this.state = 'running';
    this.errors = 0;
    this.t0 = performance.now();
    this.startIso = new Date().toISOString();
    this.items = { windows: {} };
    const wm = this.wm;

    if (t.type === 'selection') {
      for (const ic of t.icons) wm.addIcon(ic);
    } else if (t.type === 'drag_drop') {
      this.items.folders = t.folders.map((f) => ({ ...f, mesh: wm.addFolder(f) }));
      this.items.doc = wm.addDocument(t.doc);
    } else if (t.type === 'arrange_resize') {
      wm.addGhost(t.target);
      const win = wm.addWindow({ id: 'arrange', title: 'Report.docx', resizable: true });
      win.setRect(t.start.cx, t.start.cy, t.start.w, t.start.h);
      this.items.win = win;
      this.items.windows.arrange = win;
    } else if (t.type === 'reading') {
      this.#buildReading(t);
    }

    const hasSubmit = t.type === 'arrange_resize' || t.type === 'reading';
    const buttons = hasSubmit ? [{ id: 'submit', label: 'Submit', style: 'primary' }] : [];
    this.hudRefresh = () => this.#hud(this.#trialLabel(t), t.instruction, buttons);
    this.hudRefresh();
  }

  /** Document viewer window(s) on the left, Answer Panel with choice buttons on the right. */
  #buildReading(t) {
    const wm = this.wm;
    const A = TASK_AREA, { answerW, gap, docFont, choiceH } = READING;
    const h = A.top - A.bottom - 0.012;
    const cy = (A.top + A.bottom) / 2;
    const docsRight = A.right - answerW - gap;
    const n = t.documents.length;
    const dw = (docsRight - A.left - gap * (n - 1)) / n;
    t.documents.forEach((doc, i) => {
      const id = `doc_${i}`;
      const win = wm.addWindow({
        id, title: `Document Viewer ${i + 1}`, w: dw, h,
        content: (ctx, W, H) => drawDocument(ctx, W, H, doc, docFont),
      });
      win.setRect(A.left + dw / 2 + i * (dw + gap), cy, dw, h);
      this.items.windows[id] = win;
    });
    const ans = wm.addWindow({ id: 'answer', title: 'Answer Panel', w: answerW, h });
    ans.setRect(A.right - answerW / 2, cy, answerW, h);
    this.items.windows.answer = ans;
    // Choice buttons are children of the Answer Panel so they move with it.
    this.selected = null;
    this.items.choices = t.choices.map((ch, k) => {
      const b = wm.addButton({
        id: ch.id, label: ch.label, w: answerW - 0.03, h: choiceH,
        x: 0, y: h / 2 - 0.045 - 0.02 - choiceH / 2 - k * (choiceH + 0.012),
      });
      b.position.z = 0.004;
      ans.group.add(b);
      return b;
    });
  }

  #selectChoice(id, object) {
    if (this.selected !== null && this.selected !== id) this.errors++;
    this.selected = id;
    for (const b of this.items.choices) b.userData.setStyle(b === object ? 'selected' : 'normal');
  }

  #finish(success, { offset = null, sizeErr = null, selected = null, message = null } = {}) {
    const t = this.trial;
    const elapsed = (performance.now() - this.t0) / 1000;
    if (!t.practice) {
      addResult({
        participant_id: this.participantId,
        condition: this.condition,
        task_type: t.type,
        trial_index: t.index,
        start_time_iso: this.startIso,
        completion_time_sec: elapsed.toFixed(3),
        error_count: this.errors,
        final_tolerance_offset: offset == null ? '' : offset.toFixed(4),
        task_success: success,
        task_set: this.setId,
        order_index: this.orderIndex,
        final_size_error_pct: sizeErr == null ? '' : (sizeErr * 100).toFixed(2),
        selected_choice: selected ?? '',
      });
    }
    this.drag = null;
    this.state = 'feedback';
    this.feedbackUntil = performance.now() + (success ? FEEDBACK_MS : FEEDBACK_MS * 2);
    const timedOut = message === 'timeout';
    this.hudRefresh = () => this.#hud(
      timedOut ? 'Time limit reached' : message || 'Done!',
      timedOut ? 'Moving on to the next trial...' : 'Next trial coming up...',
      [],
      timedOut ? 'error' : 'success'
    );
    this.hudRefresh();
  }

  #next() {
    this.i++;
    if (this.i >= this.trials.length) this.#enterDone();
    else this.#enterReady();
  }

  #enterDone() {
    this.state = 'done';
    this.wm.clearLayer();
    this.hoverBySource.clear();
    this.hudRefresh = () => this.#hud(
      'Block complete. Thank you!',
      'All trials are finished. Please remove the headset (if wearing one) and tell the experimenter.',
      [],
      'success'
    );
    this.hudRefresh();
    this.onBlockDone?.();
  }

  /** Call every frame. */
  update() {
    const now = performance.now();
    if (this.state === 'running' && (now - this.t0) / 1000 > TRIAL_TIMEOUT_SEC) {
      const t = this.trial;
      const extra = t.type === 'arrange_resize' ? alignmentError(this.items.win.rect, t.target) : {};
      if (t.type === 'reading') extra.selected = this.selected;
      this.#finish(false, { ...extra, message: 'timeout' });
    } else if (this.state === 'feedback' && now > this.feedbackUntil) {
      this.#next();
    }
  }

  // ---- pointer handling ----------------------------------------------------------------

  pointerDown(e) {
    if (this.drag) return; // one drag at a time; ignore the other hand / other button
    const picked = this.wm.pick(e.ray);
    if (!picked) return;
    const { hit, object } = picked;

    if (hit.kind === 'button') {
      this.input.haptic(e.source, 'tap');
      this.#button(hit.id, e);
      return;
    }
    if (this.state !== 'running') return;
    const t = this.trial;

    if (t.type === 'selection' && hit.kind === 'icon') {
      if (hit.id === t.targetId) {
        object.userData.flash(COLORS.success, 800);
        this.input.haptic(e.source, 'snap');
        this.#finish(true);
      } else {
        this.errors++;
        object.userData.flash(COLORS.error);
        this.input.haptic(e.source, 'error');
      }
    } else if (t.type === 'drag_drop' && hit.kind === 'document') {
      const p = this.wm.rayToPlane(e.ray);
      if (!p) return;
      const doc = this.items.doc;
      this.drag = {
        kind: 'doc', source: e.source, button: e.button,
        offX: doc.position.x - p.local.x, offY: doc.position.y - p.local.y,
        startX: doc.position.x, startY: doc.position.y,
      };
      doc.position.z = 0.03; // lift above folders while dragging
      this.input.haptic(e.source, 'pickup');
    } else if (t.type === 'reading' && hit.kind === 'choice') {
      this.input.haptic(e.source, 'tap');
      this.#selectChoice(hit.id, object);
    } else if (hit.kind === 'title' || hit.kind === 'resize') {
      // Any window can be moved by its title bar; resizable ones from any corner or edge.
      const win = this.items.windows[hit.id];
      const p = this.wm.rayToPlane(e.ray);
      if (!win || !p) return;
      const r = win.rect;
      const base = { win, source: e.source, button: e.button };
      if (hit.kind === 'title') {
        this.drag = { ...base, kind: 'move', offX: r.cx - p.local.x, offY: r.cy - p.local.y };
      } else {
        const L = r.cx - r.w / 2, R = r.cx + r.w / 2, T = r.cy + r.h / 2, Bm = r.cy - r.h / 2;
        this.drag = {
          ...base, kind: 'resize', mx: hit.mx, my: hit.my, L, R, T, B: Bm, grip: object,
          offX: (hit.mx === 1 ? R : L) - p.local.x,
          offY: (hit.my === 1 ? T : Bm) - p.local.y,
        };
      }
      this.input.haptic(e.source, 'pickup');
    }
    this.#cursor(e.source);
  }

  pointerMove(e) {
    const d = this.drag;
    if (d && d.source === e.source) {
      const p = this.wm.rayToPlane(e.ray);
      if (p) this.#dragTo(d, p.local.x, p.local.y);
    } else {
      this.hoverBySource.set(e.source, this.wm.pick(e.ray)?.object || null);
    }
    this.#applyHover();
    if (e.source === 'mouse') this.#cursor('mouse');
  }

  pointerUp(e) {
    const d = this.drag;
    if (!d || d.source !== e.source || d.button !== e.button) return;
    this.drag = null;
    if (d.kind === 'doc') this.#drop(d, e.source);
    this.#cursor(e.source);
  }

  #dragTo(d, x, y) {
    if (d.kind === 'doc') {
      const doc = this.items.doc;
      const hw = DOC_SIZE.w / 2, hh = DOC_SIZE.h / 2;
      doc.position.x = clamp(x + d.offX, TASK_AREA.left + hw, TASK_AREA.right - hw);
      doc.position.y = clamp(y + d.offY, TASK_AREA.bottom + hh, TASK_AREA.top - hh);
      const best = this.#bestFolder();
      for (const f of this.items.folders) f.mesh.userData.setHighlight(f === best);
    } else if (d.kind === 'move') {
      const r = d.win.rect;
      const cx = clamp(x + d.offX, TASK_AREA.left + r.w / 2, TASK_AREA.right - r.w / 2);
      const cy = clamp(y + d.offY, TASK_AREA.bottom + r.h / 2, TASK_AREA.top - r.h / 2);
      d.win.setRect(cx, cy, r.w, r.h);
    } else if (d.kind === 'resize') {
      // Only the grabbed edge(s) move; the opposite side stays where it is.
      let { L, R, T, B } = d;
      const A = TASK_AREA;
      if (d.mx === 1) R = clamp(x + d.offX, L + ARRANGE.minW, A.right);
      if (d.mx === -1) L = clamp(x + d.offX, A.left, R - ARRANGE.minW);
      if (d.my === 1) T = clamp(y + d.offY, B + ARRANGE.minH, A.top);
      if (d.my === -1) B = clamp(y + d.offY, A.bottom, T - ARRANGE.minH);
      d.win.setRect((L + R) / 2, (T + B) / 2, R - L, T - B);
    }
  }

  /** Folder with the largest overlap with the document, or null. */
  #bestFolder() {
    const doc = this.items.doc.position;
    let best = null, bestArea = 0;
    for (const f of this.items.folders) {
      const ox = Math.min(doc.x + DOC_SIZE.w / 2, f.x + FOLDER_SIZE.w / 2) - Math.max(doc.x - DOC_SIZE.w / 2, f.x - FOLDER_SIZE.w / 2);
      const oy = Math.min(doc.y + DOC_SIZE.h / 2, f.y + FOLDER_SIZE.h / 2) - Math.max(doc.y - DOC_SIZE.h / 2, f.y - FOLDER_SIZE.h / 2);
      const area = ox > 0 && oy > 0 ? ox * oy : 0;
      if (area > bestArea) { bestArea = area; best = f; }
    }
    return best;
  }

  #drop(d, source) {
    const doc = this.items.doc;
    const moved = Math.hypot(doc.position.x - d.startX, doc.position.y - d.startY);
    const best = this.#bestFolder();
    for (const f of this.items.folders) f.mesh.userData.setHighlight(false);
    if (best && best.id === this.trial.targetId) {
      doc.position.set(best.x, best.y, 0.03);
      doc.scale.setScalar(0.5);
      best.mesh.userData.flash(COLORS.success, 800);
      this.input.haptic(source, 'snap');
      this.#finish(true);
      return;
    }
    doc.position.set(d.startX, d.startY, 0.004); // return to start
    if (moved < DRAG_MIN_MOVE && !best) return; // just a click on the document, not a drop
    this.errors++;
    (best ? best.mesh : doc).userData.flash(COLORS.error);
    this.input.haptic(source, 'error');
  }

  #button(id, e) {
    if (id === 'start' && this.state === 'ready') this.#start();
    else if (id === 'submit' && this.state === 'running') this.#submit(e);
    else if (id === 'skip') this.skip();
    else if (id) this.onExtraButton?.(id);
  }

  /** Test mode: jump to the next trial. Skipped trials are NOT logged. */
  skip() {
    if (this.state === 'done') return;
    this.drag = null;
    this.#next();
  }

  #submit(e) {
    const t = this.trial;
    if (this.drag) return;
    if (t.type === 'reading') {
      if (this.selected === null) {
        this.errors++;
        this.input.haptic(e.source, 'error');
        this.wm.hud.message(`${t.question} Select an answer in the Answer Panel first.`, 'error');
        return;
      }
      this.#finish(this.selected === t.correctChoiceId, { selected: this.selected, message: 'Answer recorded' });
      return;
    }
    const { offset, sizeErr } = alignmentError(this.items.win.rect, t.target);
    if (offset <= ARRANGE.posTol && sizeErr <= ARRANGE.sizeTol) {
      this.input.haptic(e.source, 'snap');
      this.#finish(true, { offset, sizeErr });
    } else {
      this.errors++;
      this.items.win.flash('#ffd9d6');
      this.input.haptic(e.source, 'error');
      this.wm.hud.message('Not aligned yet. Match the position and size of the blue outline more closely, then Submit again.', 'error');
    }
  }

  #applyHover() {
    const set = new Set([...this.hoverBySource.values()].filter(Boolean));
    if (this.drag?.kind === 'doc') set.add(this.items.doc);
    if (this.drag?.kind === 'resize') set.add(this.drag.grip);
    this.wm.setHovered(set);
  }

  #cursor(source) {
    if (source !== 'mouse' || !this.onCursor) return;
    if (this.drag?.source === 'mouse' && this.drag.kind === 'resize') return this.onCursor(resizeCursor(this.drag));
    if (this.drag?.source === 'mouse') return this.onCursor('grabbing');
    const hit = this.hoverBySource.get('mouse')?.userData.hit;
    if (hit?.kind === 'resize') return this.onCursor(resizeCursor(hit));
    const map = { button: 'pointer', icon: 'pointer', choice: 'pointer', document: 'grab', title: 'move' };
    this.onCursor(map[hit?.kind] || 'default');
  }
}

function resizeCursor({ mx, my }) {
  if (!my) return 'ew-resize';
  if (!mx) return 'ns-resize';
  return mx === my ? 'nesw-resize' : 'nwse-resize';
}
