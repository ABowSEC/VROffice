// Participant IDs, counterbalancing and reading condition-page parameters.

export const CONDITION_IDS = ['desktop', 'vr_quest2'];

/** Normalize "1", "p1", "P01" -> "P01". Returns null if invalid. */
export function normalizeParticipantId(raw) {
  const m = String(raw || '').trim().match(/^p?0*(\d{1,3})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (n < 1) return null;
  return `P${String(n).padStart(2, '0')}`;
}

export function participantNumber(pid) {
  return parseInt(pid.slice(1), 10);
}

const ORDERS = [
  [{ condition: 'desktop', set: 'A' }, { condition: 'vr_quest2', set: 'B' }],
  [{ condition: 'vr_quest2', set: 'A' }, { condition: 'desktop', set: 'B' }],
  [{ condition: 'desktop', set: 'B' }, { condition: 'vr_quest2', set: 'A' }],
  [{ condition: 'vr_quest2', set: 'B' }, { condition: 'desktop', set: 'A' }],
];

/**
 * Counterbalanced order, cycling through 4 orders by participant number:
 *   P01: desktop/A -> VR/B     P02: VR/A -> desktop/B
 *   P03: desktop/B -> VR/A     P04: VR/B -> desktop/A    (then repeats)
 * startOverride ('desktop' | 'vr_quest2') forces the first condition; the layout-set order is kept.
 */
export function assignOrder(pid, startOverride = null) {
  const o = ORDERS[(participantNumber(pid) - 1) % 4];
  if (!startOverride || o[0].condition === startOverride) return o;
  return [
    { condition: o[1].condition, set: o[0].set },
    { condition: o[0].condition, set: o[1].set },
  ];
}

/** URL for running one block. */
export function conditionUrl({ pid, condition, set, orderIndex, testMode = false }) {
  const page = condition === 'vr_quest2' ? 'vr.html' : 'desktop.html';
  const q = new URLSearchParams({ pid, set, order: String(orderIndex) });
  if (testMode) q.set('test', '1');
  return `${page}?${q}`;
}

/** Read pid/set/order from the current page URL (desktop.html and vr.html). */
export function readConditionParams() {
  const q = new URLSearchParams(location.search);
  const pid = normalizeParticipantId(q.get('pid')) || 'P00'; // P00 = dev / testing
  const setId = (q.get('set') || 'A').toUpperCase() === 'B' ? 'B' : 'A';
  const orderIndex = parseInt(q.get('order') || '1', 10) || 1;
  // Test mode (Skip button): ?test=1, or always for the dev participant P00.
  const testMode = q.get('test') === '1' || pid === 'P00';
  return { pid, setId, orderIndex, testMode };
}
