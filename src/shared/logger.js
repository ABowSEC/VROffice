// Logger. Every trial record is written to localStorage immediately, so a crash,
// reload or headset sleep does not lose data. Export as CSV.
// NOTE: localStorage is per device and per origin. Data recorded on the Quest
// stays on the Quest and must be exported from there.

const RESULTS_KEY = 'vo_results_v2'; // v2 = design-doc schema (v1 was the old document-task schema)
const QUESTIONNAIRE_KEY = 'vo_questionnaire_v1';

// Design-doc schema first, then extra columns.
export const RESULT_COLUMNS = [
  'participant_id', 'condition', 'task_type', 'trial_index', 'start_time_iso', 'completion_time_sec',
  'error_count', 'final_tolerance_offset', 'task_success',
  'task_set', 'order_index', 'final_size_error_pct', 'selected_choice',
];
export const QUESTIONNAIRE_COLUMNS = ['participant_id', 'phase', 'condition', 'question_id', 'response', 'timestamp'];

function load(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}
function save(key, rows) {
  try {
    localStorage.setItem(key, JSON.stringify(rows));
  } catch (e) {
    console.error('Could not save to localStorage', e);
  }
}

export function addResult(row) {
  const rows = load(RESULTS_KEY);
  rows.push(row);
  save(RESULTS_KEY, rows);
}
export function getResults() {
  return load(RESULTS_KEY);
}

export function addQuestionnaireRows(rows) {
  const all = load(QUESTIONNAIRE_KEY);
  all.push(...rows);
  save(QUESTIONNAIRE_KEY, all);
}
export function getQuestionnaireRows() {
  return load(QUESTIONNAIRE_KEY);
}

export function clearAll() {
  try {
    localStorage.removeItem(RESULTS_KEY);
    localStorage.removeItem(QUESTIONNAIRE_KEY);
  } catch { /* ignore */ }
}

function csvCell(v) {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(rows, columns) {
  const lines = [columns.join(',')];
  for (const r of rows) lines.push(columns.map((c) => csvCell(r[c])).join(','));
  return lines.join('\n') + '\n';
}

export function downloadText(filename, text, mime = 'text/csv') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

/**
 * Download results. Optional filters: pid (one participant), condition.
 * label is added to the file name.
 */
export function downloadResultsCSV({ pid, condition, label } = {}) {
  let rows = getResults();
  if (pid) rows = rows.filter((r) => r.participant_id === pid);
  if (condition) rows = rows.filter((r) => r.condition === condition);
  const parts = ['results', pid, label || condition, stamp()].filter(Boolean);
  downloadText(`${parts.join('_')}.csv`, toCSV(rows, RESULT_COLUMNS));
}
export function downloadQuestionnaireCSV() {
  downloadText(`questionnaires_${stamp()}.csv`, toCSV(getQuestionnaireRows(), QUESTIONNAIRE_COLUMNS));
}
