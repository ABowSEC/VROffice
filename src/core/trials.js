// Trial definitions. Set B is set A mirrored left-right (x -> -x) with different
// file names / folder labels, so the two blocks have equivalent layouts and
// movement distances without being identical.
//
// Block order: Selection, Drag & Drop, Arrange & Resize, Document Reading (each: practice + 3).
import readingA from './reading/setA.json' with { type: 'json' };
import readingB from './reading/setB.json' with { type: 'json' };

const SEL_GRID = { cols: 5, rows: 3, dx: 0.2, dy: 0.19, cy: -0.08 };

const NAMES = {
  A: [
    'budget.xlsx', 'notes.txt', 'report.docx', 'photo.jpg', 'slides.pptx', 'invoice.pdf', 'agenda.docx',
    'data.csv', 'logo.png', 'memo.txt', 'schedule.xlsx', 'contract.pdf', 'draft.docx', 'summary.pdf',
    'song.mp3', 'backup.zip', 'roster.xlsx', 'plan.pptx', 'video.mp4', 'map.png',
  ],
  B: [
    'expenses.xlsx', 'todo.txt', 'proposal.docx', 'scan.jpg', 'pitch.pptx', 'receipt.pdf', 'minutes.docx',
    'survey.csv', 'banner.png', 'readme.txt', 'shifts.xlsx', 'lease.pdf', 'outline.docx', 'review.pdf',
    'podcast.mp3', 'archive.zip', 'payroll.xlsx', 'demo.pptx', 'clip.mp4', 'chart.png',
  ],
};

// target cell [row, col] in set A (mirrored col in set B)
const SELECTION = [
  { practice: true, target: [1, 2], seed: 11 },
  { target: [0, 4], seed: 21 },
  { target: [2, 0], seed: 31 },
  { target: [1, 1], seed: 41 },
];

const FOLDER_DEFS = [
  { label: 'Finance', color: '#2e8b57' },
  { label: 'Projects', color: '#2f6fb3' },
  { label: 'Archive', color: '#6b7480' },
  { label: 'Clients', color: '#c76b1a' },
  { label: 'Personal', color: '#8a4fb3' },
  { label: 'Reports', color: '#b33a3a' },
];

const DRAG = [
  { practice: true, doc: [-0.42, -0.08], folders: [[0.1, 0.06], [0.4, 0.06], [0.25, -0.22]], labels: [0, 1, 2], target: 1, docName: { A: 'notes.txt', B: 'memo.txt' } },
  { doc: [-0.45, 0.05], folders: [[0.05, -0.2], [0.3, 0.08], [0.45, -0.2]], labels: [3, 0, 4], target: 2, docName: { A: 'invoice.pdf', B: 'receipt.pdf' } },
  { doc: [-0.45, -0.2], folders: [[0.0, 0.08], [0.25, -0.22], [0.45, 0.08]], labels: [5, 1, 2], target: 0, docName: { A: 'budget.xlsx', B: 'payroll.xlsx' } },
  { doc: [-0.4, -0.08], folders: [[0.1, -0.2], [0.3, 0.08], [0.48, -0.15]], labels: [1, 3, 0], target: 1, docName: { A: 'minutes.docx', B: 'agenda.docx' } },
];

// window start and ghost target as { cx, cy, w, h } (workspace-local, metres)
const ARRANGE = [
  { practice: true, start: [-0.25, -0.05, 0.3, 0.22], target: [0.2, -0.05, 0.34, 0.26] },
  { start: [-0.3, 0.0, 0.3, 0.22], target: [0.2, -0.08, 0.42, 0.3] },
  { start: [0.25, -0.05, 0.45, 0.32], target: [-0.25, 0.0, 0.3, 0.2] },
  { start: [-0.2, -0.15, 0.25, 0.18], target: [0.25, 0.0, 0.36, 0.36] },
];

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, rand) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildTrials(setId = 'A') {
  const B = setId === 'B';
  const mx = (x) => (B ? -x : x);
  const trials = [];
  const push = (type, list, make) => {
    let n = 0;
    for (const base of list) {
      trials.push({ type, practice: !!base.practice, index: base.practice ? 0 : ++n, ...make(base) });
    }
  };

  push('selection', SELECTION, (b) => {
    const rand = mulberry32(b.seed + (B ? 1000 : 0));
    const names = shuffle(NAMES[setId] || NAMES.A, rand).slice(0, SEL_GRID.cols * SEL_GRID.rows);
    const [tr, tcRaw] = b.target;
    const tc = B ? SEL_GRID.cols - 1 - tcRaw : tcRaw;
    const icons = [];
    let k = 1;
    for (let r = 0; r < SEL_GRID.rows; r++) {
      for (let c = 0; c < SEL_GRID.cols; c++) {
        const isTarget = r === tr && c === tc;
        icons.push({
          id: `icon_${r}_${c}`,
          name: isTarget ? names[0] : names[k++],
          x: (c - (SEL_GRID.cols - 1) / 2) * SEL_GRID.dx,
          y: SEL_GRID.cy + ((SEL_GRID.rows - 1) / 2 - r) * SEL_GRID.dy,
        });
      }
    }
    const targetId = `icon_${tr}_${tc}`;
    return { icons, targetId, instruction: `Select the file "${names[0]}".` };
  });

  push('drag_drop', DRAG, (b) => {
    const folders = b.folders.map(([x, y], i) => {
      const def = FOLDER_DEFS[(b.labels[i] + (B ? 3 : 0)) % FOLDER_DEFS.length];
      return { id: `folder_${i}`, label: def.label, color: def.color, x: mx(x), y };
    });
    const target = folders[b.target];
    const docName = b.docName[setId] || b.docName.A;
    return {
      doc: { id: 'doc', name: docName, x: mx(b.doc[0]), y: b.doc[1] },
      folders,
      targetId: target.id,
      instruction: `Drag "${docName}" into the ${target.label} folder.`,
    };
  });

  push('arrange_resize', ARRANGE, (b) => {
    const rect = ([cx, cy, w, h]) => ({ cx: mx(cx), cy, w, h });
    return {
      start: rect(b.start),
      target: rect(b.target),
      instruction: 'Move the window by its title bar and resize it by dragging any corner or edge to match the blue outline, then press Submit.',
    };
  });

  // Document Reading (from the first version): read 1-2 documents, pick the answer, Submit.
  const reading = (B ? readingB : readingA).tasks;
  push('reading', reading, (b) => ({
    readingId: b.id,
    question: b.question,
    documents: b.documents,
    choices: b.choices,
    correctChoiceId: b.correctChoiceId,
    instruction: b.question,
  }));

  return trials;
}

/** Tolerance check for Arrange & Resize. */
export function alignmentError(rect, target) {
  const offset = Math.hypot(rect.cx - target.cx, rect.cy - target.cy);
  const sizeErr = Math.max(Math.abs(rect.w - target.w) / target.w, Math.abs(rect.h - target.h) / target.h);
  return { offset, sizeErr };
}
