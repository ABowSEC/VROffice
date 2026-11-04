import './launcher.css';
import { normalizeParticipantId, assignOrder, conditionUrl } from './shared/session.js';
import { CONDITION_LABELS } from './core/config.js';
import {
  addQuestionnaireRows, getResults, getQuestionnaireRows, clearAll,
  downloadResultsCSV, downloadQuestionnaireCSV,
} from './shared/logger.js';
import { PRE_QUESTIONS, POST_QUESTIONS, renderForm, susScore } from './ui/questionnaires.js';

const PID_KEY = 'vo_current_pid';
const START_KEY = 'vo_start_override';
const TEST_KEY = 'vo_test_mode';
const $ = (id) => document.getElementById(id);

let pid = null;
let startOverride = '';
try {
  pid = localStorage.getItem(PID_KEY);
  startOverride = localStorage.getItem(START_KEY) || '';
} catch { /* ignore */ }
$('start-override').value = startOverride;
let testMode = false;
try { testMode = localStorage.getItem(TEST_KEY) === '1'; } catch { /* ignore */ }
$('test-mode').checked = testMode;
$('test-mode').addEventListener('change', () => {
  testMode = $('test-mode').checked;
  try { localStorage.setItem(TEST_KEY, testMode ? '1' : '0'); } catch { /* ignore */ }
  if (pid) setParticipant(pid);
});

function setParticipant(newPid) {
  pid = newPid;
  try {
    localStorage.setItem(PID_KEY, pid);
    localStorage.setItem(START_KEY, startOverride);
  } catch { /* ignore */ }
  $('pid-input').value = pid;
  const order = assignOrder(pid, startOverride || null);
  $('order').innerHTML = `
    <p><b>${pid}</b>: ${startOverride ? 'starting condition set manually' : 'counterbalanced order'}:</p>
    <table>
      <tr><th>Block</th><th>Condition</th><th>Layout set</th><th></th></tr>
      ${order.map((o, i) => {
        const url = conditionUrl({ pid, condition: o.condition, set: o.set, orderIndex: i + 1, testMode });
        return `<tr><td>${i + 1}</td><td>${CONDITION_LABELS[o.condition]}</td>
          <td>${o.set}</td><td><a href="${url}">Open ${CONDITION_LABELS[o.condition]}</a></td></tr>`;
      }).join('')}
    </table>
    <p class="muted">Run the VR condition from this launcher <em>opened in the Quest Browser</em>.
      Each block has 3 tasks (Selection, Drag &amp; Drop, Arrange &amp; Resize), each with 1 unscored practice trial and 3 scored trials.
      After block 1, fill in the post-condition questionnaire below (intermission), then run block 2.</p>`;
}

$('pid-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const p = normalizeParticipantId($('pid-input').value);
  if (!p) return alert('Enter a participant number such as 1 or P01.');
  startOverride = $('start-override').value;
  setParticipant(p);
});
if (pid) setParticipant(pid);

function requirePid() {
  if (!pid) alert('Set the participant number first.');
  return pid;
}

function toRows(phase, condition, answers) {
  const ts = new Date().toISOString();
  return Object.entries(answers).map(([question_id, response]) => ({
    participant_id: pid, phase, condition, question_id, response, timestamp: ts,
  }));
}

function flash(el, text) {
  el.textContent = text;
  setTimeout(() => (el.textContent = ''), 4000);
}

// Pre-study questionnaire
const readPre = renderForm($('pre-form'), PRE_QUESTIONS, 'pre');
$('pre-save').addEventListener('click', () => {
  if (!requirePid()) return;
  const answers = readPre();
  if (!answers) return alert('Please answer every question.');
  addQuestionnaireRows(toRows('pre', '', answers));
  $('pre-form').reset();
  flash($('pre-status'), `Saved for ${pid}.`);
  updateSummary();
});

// Post-condition questionnaire
const readPost = renderForm($('post-form'), POST_QUESTIONS, 'post');
$('post-save').addEventListener('click', () => {
  if (!requirePid()) return;
  const condition = $('post-condition').value;
  if (!condition) return alert('Select which condition was just completed.');
  const answers = readPost();
  if (!answers) return alert('Please answer every question.');
  const comments = $('post-comments').value.trim();
  addQuestionnaireRows(toRows('post', condition, {
    ...answers,
    sus_score: susScore(answers),
    ...(comments ? { comments } : {}),
  }));
  $('post-form').reset();
  $('post-comments').value = '';
  $('post-condition').value = '';
  flash($('post-status'), `Saved ${CONDITION_LABELS[condition]} answers for ${pid}.`);
  updateSummary();
});

// Data export
function updateSummary() {
  const r = getResults(), q = getQuestionnaireRows();
  const pids = new Set([...r, ...q].map((x) => x.participant_id));
  $('data-summary').textContent = `${r.length} task results and ${q.length} questionnaire answers stored, from ${pids.size} participant(s).`;
}
$('dl-results').addEventListener('click', () => downloadResultsCSV());
$('dl-quest').addEventListener('click', () => downloadQuestionnaireCSV());
$('clear').addEventListener('click', () => {
  if (!confirm('Delete ALL stored results and questionnaires on this device? Export first!')) return;
  if (!confirm('Are you sure? This cannot be undone.')) return;
  clearAll();
  updateSummary();
});
updateSummary();
