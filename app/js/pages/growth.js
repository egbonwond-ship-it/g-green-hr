import { api, isHR, can, today, me, role } from '../api.js';
import { h, toast, card, dataTable, tabs, pageHead, stat, barList, avatar, editRecord, progress, badge } from '../ui.js';
import { surveyPrompt } from './home.js';

export async function performance(el) {
  el.append(pageHead('Performance management', role() === 'employee' ? 'Your goals and reviews.' : 'Goals, OKRs and review cycles for your people.'));
  el.append(tabs([
    { id: 'goals', label: 'Goals & OKRs', render: () => dataTable('goals', { columns: ['employee_id', 'title', 'category', 'due_date', 'progress', 'status'], filters: ['status', 'category'], defaults: { status: 'Not started', progress: 0 } }) },
    { id: 'reviews', label: 'Reviews', render: () => dataTable('performance_reviews', { columns: ['employee_id', 'reviewer_id', 'cycle', 'rating', 'status', 'review_date'], filters: ['cycle', 'status'], defaults: { reviewer_id: me(), status: 'Draft', review_date: today() } }) },
    { id: 'dist', label: 'Ratings overview', show: role() !== 'employee', render: () => ratings() },
  ], 'goals'));
}

function ratings() {
  const box = h('div', { class: 'grid g2' });
  api('r/performance_reviews').then((rows) => {
    const done = rows.filter((r) => r.rating && r.status !== 'Draft');
    const labels = { 5: '5 · Outstanding', 4: '4 · Exceeds', 3: '3 · Meets', 2: '2 · Partially meets', 1: '1 · Below' };
    const avg = done.length ? (done.reduce((t, r) => t + r.rating, 0) / done.length).toFixed(1) : '—';
    box.append(card('Rating distribution', h('div', { class: 'stats' }, stat('Reviews completed', done.length), stat('Average rating', avg), stat('Drafts open', rows.filter((r) => r.status === 'Draft').length)),
      barList([5, 4, 3, 2, 1].map((r) => ({ label: labels[r], value: done.filter((x) => x.rating === r).length })))));
    const top = done.filter((r) => r.rating >= 5);
    box.append(card('Top performers', top.length ? h('ul', { class: 'list' }, top.map((r) => h('li', {}, avatar(r.employee_id__label, 'xs'), h('span', { class: 'grow' }, h('div', {}, r.employee_id__label), h('div', { class: 'sub' }, r.strengths || '')), h('span', { class: 'badge good' }, r.cycle)))) : h('p', { class: 'muted' }, 'No 5-rated reviews yet.')));
  });
  return box;
}

export async function talent(el) {
  el.append(pageHead('Talent management', 'Skills inventory, certifications and succession plans for critical roles.'));
  el.append(tabs([
    { id: 'skills', label: 'Skills inventory', render: () => h('div', { class: 'stack' }, skillsSummary(), dataTable('employee_skills', { columns: ['employee_id', 'skill', 'proficiency', 'certified'], filters: ['proficiency'] })) },
    { id: 'succ', label: 'Succession plans', show: can('succession_plans', 'r'), render: () => dataTable('succession_plans', { columns: ['position', 'incumbent_id', 'successor_id', 'readiness', 'risk_of_loss'], filters: ['readiness', 'risk_of_loss'] }) },
  ], 'skills'));
}

function skillsSummary() {
  const box = h('div');
  api('r/employee_skills').then((rows) => {
    const m = {}; rows.forEach((r) => { m[r.skill] = m[r.skill] || { n: 0, exp: 0 }; m[r.skill].n++; if (['Advanced', 'Expert'].includes(r.proficiency)) m[r.skill].exp++; });
    const data = Object.entries(m).map(([label, v]) => ({ label, value: v.n })).sort((a, b) => b.value - a.value).slice(0, 12);
    box.append(card('Most common skills (people)', barList(data)));
  });
  return box;
}

export async function learning(el) {
  el.append(pageHead('Learning & development', 'Course catalogue, training records and mandatory compliance training.'));
  el.append(tabs([
    { id: 'records', label: 'Training records', show: can('course_enrollments', 'r'), render: () => h('div', { class: 'stack' }, role() !== 'employee' ? completion() : null, dataTable('course_enrollments', { columns: ['employee_id', 'course_id', 'status', 'progress', 'enrolled_date', 'completed_date'], filters: ['status', 'course_id'], defaults: { status: 'Enrolled', progress: 0, enrolled_date: today() } })) },
    { id: 'catalog', label: 'Course catalogue', render: () => dataTable('courses', { columns: ['title', 'category', 'provider', 'duration_hours', 'delivery', 'mandatory'], filters: ['category'] }) },
  ], 'records'));
}

function completion() {
  const box = h('div');
  Promise.all([api('r/courses'), api('r/course_enrollments')]).then(([cs, en]) => {
    const rows = cs.filter((c) => c.mandatory).map((c) => { const e = en.filter((x) => x.course_id === c.id); return { label: c.title, value: e.length ? Math.round((e.filter((x) => x.status === 'Completed').length / e.length) * 100) : 0 }; });
    const overdue = en.filter((x) => x.status === 'Overdue').length;
    box.append(h('div', { class: 'grid g2' },
      card('Mandatory training completion', barList(rows, { format: (v) => `${v}%`, max: 100 })),
      h('div', { class: 'stats', style: { alignContent: 'start' } }, stat('Enrolments', en.length), stat('Completed', en.filter((x) => x.status === 'Completed').length), stat('Overdue', overdue, overdue ? 'Follow up with managers' : 'None', overdue ? 'alert' : ''), stat('Learning hours logged', Math.round(en.filter((x) => x.status === 'Completed').reduce((t, x) => t + Number(cs.find((c) => c.id === x.course_id)?.duration_hours || 0), 0))))));
  });
  return box;
}

export async function engagement(el) {
  el.append(pageHead('Employee engagement', 'Announcements, peer recognition and pulse surveys.'));
  el.append(tabs([
    { id: 'recog', label: 'Recognition', render: () => recognitionWall() },
    { id: 'news', label: 'Announcements', render: () => dataTable('announcements', { columns: ['title', 'audience', 'posted_date', 'pinned'], defaults: { posted_date: today(), audience: 'Everyone' }, hide: ['author_id'] }) },
    { id: 'surveys', label: 'Pulse surveys', render: () => surveys() },
  ], 'recog'));
}

function recognitionWall() {
  const box = h('div', { class: 'stack' });
  const draw = () => api('r/recognitions').then((rows) => {
    box.replaceChildren(
      can('recognitions', 'c') ? h('div', {}, h('button', { class: 'btn primary', onclick: () => editRecord('recognitions', null, { onSaved: draw, hide: ['from_id', 'given_date'], title: 'Recognise a colleague' }) }, 'Recognise a colleague')) : h('span'),
      h('div', { class: 'grid g3' }, rows.map((r) => card(null, h('div', { class: 'profile-head', style: { marginBottom: '8px' } }, avatar(r.to_id__label), h('div', { class: 'grow' }, h('b', {}, r.to_id__label), h('div', {}, h('span', { class: 'badge good' }, r.badge)))),
        h('p', {}, `"${r.message}"`), h('div', { class: 'muted small' }, `From ${r.from_id__label} · ${new Date(r.given_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`)))));
  });
  draw();
  return box;
}

function surveys() {
  const box = h('div', { class: 'stack' });
  Promise.all([api('r/surveys'), isHR() ? api('analytics') : Promise.resolve(null), api('r/survey_responses', { query: me() ? { employee_id: me() } : {} })]).then(([ss, an, mine]) => {
    const answered = new Set(mine.filter((m) => m.employee_id === me()).map((m) => m.survey_id));
    const open = ss.filter((s) => s.status === 'Open');
    if (open.length && me()) box.append(card('Open surveys', h('ul', { class: 'list' }, open.map((s) => h('li', {}, h('span', { class: 'grow' }, h('div', {}, h('b', {}, s.title)), h('div', { class: 'sub' }, s.question)),
      answered.has(s.id) ? badge('Completed') : h('button', { class: 'btn sm primary', onclick: () => surveyPrompt(s, () => { toast('Response recorded'); }) }, 'Respond'))))));
    if (an?.enps?.length) box.append(card('Employee Net Promoter Score (eNPS) by survey', barList(an.enps.map((e) => ({ label: `${e.label} (${e.responses} responses)`, value: e.value })), { max: 100, format: (v) => (v > 0 ? `+${v}` : String(v)) }),
      h('p', { class: 'muted small', style: { marginTop: '8px' } }, 'eNPS = % promoters (9-10) minus % detractors (0-6). Above +10 is good, above +30 is excellent.')));
    box.append(dataTable('surveys', { columns: ['title', 'status', 'open_date', 'close_date'], defaults: { status: 'Draft', open_date: today() } }));
    if (isHR()) box.append(dataTable('survey_responses', { title: 'Responses', columns: ['survey_id', 'score', 'comment', 'response_date'], filters: ['survey_id'], allowCreate: false }));
  });
  return box;
}

export { progress };
