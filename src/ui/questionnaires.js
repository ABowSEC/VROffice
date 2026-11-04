// Questionnaire definitions + simple HTML form rendering.
// Pre-study: technology / VR familiarity (participant characteristic, RQ2).
// Post-condition: System Usability Scale (SUS, 10 items) + comfort item.

const LIKERT5 = ['1', '2', '3', '4', '5'];

export const PRE_QUESTIONS = [
  { id: 'computer_familiarity', text: 'How familiar are you with using a computer for office work (documents, email, multiple windows)?', options: LIKERT5, anchors: ['Not at all', 'Very familiar'] },
  { id: 'vr_experience', text: 'How many times have you used a VR headset before?', options: ['Never', '1–2 times', '3–10 times', 'More than 10 times'] },
  { id: 'vr_controller_comfort', text: 'How comfortable are you using VR or game controllers?', options: LIKERT5, anchors: ['Not at all', 'Very comfortable'] },
  { id: 'gaming_frequency', text: 'How often do you play video games?', options: ['Never', 'A few times a year', 'Monthly', 'Weekly', 'Daily'] },
];

export const SUS_ITEMS = [
  'I think that I would like to use this system frequently.',
  'I found the system unnecessarily complex.',
  'I thought the system was easy to use.',
  'I think that I would need the support of a technical person to be able to use this system.',
  'I found the various functions in this system were well integrated.',
  'I thought there was too much inconsistency in this system.',
  'I would imagine that most people would learn to use this system very quickly.',
  'I found the system very cumbersome to use.',
  'I felt very confident using the system.',
  'I needed to learn a lot of things before I could get going with this system.',
];

export const POST_QUESTIONS = [
  ...SUS_ITEMS.map((text, i) => ({ id: `sus_${i + 1}`, text, options: LIKERT5, anchors: ['Strongly disagree', 'Strongly agree'] })),
  { id: 'discomfort', text: 'I felt physical discomfort (eye strain, dizziness, nausea) during this condition.', options: LIKERT5, anchors: ['Strongly disagree', 'Strongly agree'] },
];

/** SUS score 0–100 from answers {sus_1..sus_10: '1'..'5'} */
export function susScore(answers) {
  let sum = 0;
  for (let i = 1; i <= 10; i++) {
    const v = parseInt(answers[`sus_${i}`], 10);
    sum += i % 2 === 1 ? v - 1 : 5 - v;
  }
  return sum * 2.5;
}

/** Render questions into a <form>. Returns a function that reads answers or null if incomplete. */
export function renderForm(form, questions, prefix) {
  form.innerHTML = questions.map((q, qi) => `
    <fieldset class="q">
      <legend>${qi + 1}. ${q.text}</legend>
      <div class="opts">
        ${q.anchors ? `<span class="anchor">${q.anchors[0]}</span>` : ''}
        ${q.options.map((o) => `
          <label><input type="radio" name="${prefix}_${q.id}" value="${o}" required> ${o}</label>`).join('')}
        ${q.anchors ? `<span class="anchor">${q.anchors[1]}</span>` : ''}
      </div>
    </fieldset>`).join('');

  return () => {
    const answers = {};
    for (const q of questions) {
      const checked = form.querySelector(`input[name="${prefix}_${q.id}"]:checked`);
      if (!checked) return null;
      answers[q.id] = checked.value;
    }
    return answers;
  };
}
