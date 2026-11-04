// Shared constants for both conditions. Units: metres (1 Three.js unit = 1 m).
//
// "Workspace-local" coordinates: origin at the centre of the workspace plane,
// x to the right, y up, z towards the user. All task logic works in these coords.

export const WORKSPACE = { y: 1.25, z: -0.9, width: 1.3, height: 0.8 };
export const DESK_Y = 0.75;

// Instruction bar (HUD) across the top of the workspace.
export const HUD = { cy: 0.3, width: 1.26, height: 0.18, titleH: 0.04, btnW: 0.17, btnH: 0.08 };

// Region where task items live (below the HUD).
export const TASK_AREA = { left: -0.63, right: 0.63, top: 0.2, bottom: -0.39 };

export const ICON_SIZE = 0.15;
export const DOC_SIZE = { w: 0.12, h: 0.15 };
export const FOLDER_SIZE = { w: 0.2, h: 0.16 };

export const ARRANGE = {
  posTol: 0.03, // centre offset <= 3 cm
  sizeTol: 0.05, // width and height within 5 %
  minW: 0.2,
  minH: 0.14,
  titleH: 0.045,
  handle: 0.045, // corner handles
  edge: 0.026, // edge resize strips (straddle the window border)
};

// Document Reading task layout
export const READING = { answerW: 0.34, gap: 0.02, docFont: 0.0195, choiceH: 0.062 };
export const WINDOW_TITLE_H = 0.045;

export const DRAG_MIN_MOVE = 0.01; // a "drop" that moved less than 1 cm is ignored, not an error
export const TRIAL_TIMEOUT_SEC = 120;
export const FEEDBACK_MS = 900;

export const CONDITIONS = { desktop: 'desktop', vr: 'vr_quest2' };
export const CONDITION_LABELS = { desktop: '2D Desktop', vr_quest2: 'VR (Quest 2)' };
export const TASK_LABELS = {
  selection: 'Task 1: Selection',
  drag_drop: 'Task 2: Drag & Drop',
  arrange_resize: 'Task 3: Arrange & Resize',
  reading: 'Task 4: Document Reading',
};

// Light office theme (closer to the first version).
export const COLORS = {
  sky: '#c9d3dc',
  surface: '#e3e9ef', // desktop "wallpaper"
  frame: '#2a3440',
  hudBg: '#ffffff',
  text: '#111111',
  muted: '#4a4a4a',
  accent: '#2f6fb3',
  hover: '#5aa9ff',
  error: '#d93a32',
  success: '#2e9e5b',
  btn: '#eef2f6',
  btnBorder: '#8a97a5',
  selected: '#ffd84d',
  windowBody: '#ffffff',
  titleBar: '#2f6fb3',
  titleHover: '#4f93df',
  handle: '#f0a020',
  handleHover: '#ffd060',
  edge: '#8a97a5',
  edgeHover: '#ffd060',
  ghost: '#1d7fd6',
  paper: '#ffffff',
};
