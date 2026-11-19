import { api, money, date, isHR, can, today, role, lookup, me } from '../api.js';
import { h, clear, toast, card, badge, dataTable, editRecord, tabs, pageHead, modal, stat, avatar } from '../ui.js';

// ---------- Recruiting ----------
const STAGES = ['Applied', 'Screening', 'Interview', 'Offer', 'Hired', 'Rejected'];

export async function recruiting(el) {
  el.append(pageHead('Recruiting', 'Job openings, the candidate pipeline and hiring. Drag a candidate card to move it to the next stage.'));
  el.append(tabs([
    { id: 'pipeline', label: 'Pipeline', show: can('candidates', 'r'), render: () => pipeline() },
    { id: 'jobs', label: 'Job openings', render: () => dataTable('job_openings', { columns: ['title', 'department_id', 'location', 'employment_type', 'openings', 'status', 'posted_date', 'hiring_manager_id'], defaults: { status: 'Open', posted_date: today(), openings: 1 } }) },
    { id: 'cands', label: 'All candidates', show: can('candidates', 'r'), render: () => dataTable('candidates', { columns: ['full_name', 'job_id', 'source', 'stage', 'rating', 'applied_date'], filters: ['stage', 'job_id', 'source'], defaults: { stage: 'Applied', applied_date: today() } }) },
  ], 'pipeline'));
}

function pipeline() {
  const box = h('div', { class: 'stack' });
  let jobFilter = '';
  const board = h('div', { class: 'board' });
  const draw = async () => {
    const cands = await api('r/candidates', { query: jobFilter ? { job_id: jobFilter } : {} });
    clear(board);
    for (const st of STAGES) {
      const list = cands.filter((c) => c.stage === st);
      const col = h('div', { class: 'col-k', 'data-stage': st,
        ondragover: (e) => { e.preventDefault(); col.classList.add('drop'); }, ondragleave: () => col.classList.remove('drop'),
        ondrop: async (e) => { e.preventDefault(); col.classList.remove('drop'); const id = Number(e.dataTransfer.getData('text/plain')); const c = cands.find((x) => x.id === id); if (!c || c.stage === st) return; if (st === 'Hired') return hire(c, draw); try { await api(`r/candidates/${id}`, { method: 'PUT', body: { stage: st } }); toast(`${c.full_name} moved to ${st}`); draw(); } catch (err) { toast(err.message, 'err'); } } },
      h('h4', {}, st, h('span', {}, list.length)),
      list.map((c) => h('div', { class: 'kcard', draggable: can('candidates', 'u') ? 'true' : null, ondragstart: (e) => e.dataTransfer.setData('text/plain', String(c.id)), onclick: () => editRecord('candidates', c, { onSaved: draw }) },
        h('b', {}, c.full_name), h('div', { class: 'sub' }, c.job_id__label), h('div', { class: 'sub' }, `${c.source || ''} · ${date(c.applied_date)}`),
        c.rating ? h('div', { class: 'stars', 'aria-label': `${c.rating} of 5` }, '★'.repeat(c.rating) + '☆'.repeat(5 - c.rating)) : null,
        st === 'Offer' && isHR() ? h('button', { class: 'btn sm primary', style: { marginTop: '6px' }, onclick: (e) => { e.stopPropagation(); hire(c, draw); } }, 'Hire') : null)));
      board.append(col);
    }
  };
  const jobSel = h('select', { class: 'inline-input', onchange: (e) => { jobFilter = e.target.value; draw(); } }, h('option', { value: '' }, 'All jobs'));
  lookup('job_openings').then((js) => js.forEach((j) => jobSel.append(h('option', { value: j.id }, j.label))));
  box.append(h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, jobSel, can('candidates', 'c') ? h('button', { class: 'btn primary', onclick: () => editRecord('candidates', null, { onSaved: draw, defaults: { stage: 'Applied', applied_date: today(), job_id: jobFilter || '' } }) }, '+ Add candidate') : null), board);
  draw();
  return box;
}

async function hire(c, onDone) {
  if (!isHR()) return toast('Only HR can complete a hire', 'err');
  const salary = h('input', { type: 'number', value: c.expected_salary || '', class: 'inline-input' });
  const start = h('input', { type: 'date', value: today(), class: 'inline-input' });
  const email = h('input', { type: 'email', value: `${c.full_name.toLowerCase().replace(/\s+/g, '.')}@gogreen.demo`, class: 'inline-input' });
  const mgr = h('select', { class: 'inline-input' }, h('option', { value: '' }, 'Hiring manager on the job'));
  lookup('employees').then((es) => es.filter((x) => x.status !== 'Terminated').forEach((x) => mgr.append(h('option', { value: x.id }, x.label))));
  modal(`Hire ${c.full_name}`, h('div', {}, h('p', { class: 'muted' }, `For ${c.job_id__label}. This creates the employee record, a login, and the onboarding checklist.`),
    h('div', { class: 'form-grid' }, h('label', { class: 'field' }, h('span', {}, 'Annual gross salary'), salary), h('label', { class: 'field' }, h('span', {}, 'Start date'), start),
      h('label', { class: 'field' }, h('span', {}, 'Work email'), email), h('label', { class: 'field' }, h('span', {}, 'Manager'), mgr))), {
    actions: [{ label: 'Cancel', onClick: (x) => x() }, { label: 'Confirm hire', kind: 'primary', onClick: async (x) => {
      try {
        const r = await api('recruiting/hire', { method: 'POST', body: { candidate_id: c.id, base_salary: Number(salary.value), hire_date: start.value, email: email.value, manager_id: mgr.value || undefined } });
        x(); onDone?.();
        modal('Hire complete', h('div', {}, h('p', {}, `${c.full_name} is now an employee and their onboarding checklist has started.`), h('p', {}, 'Share these first-login details securely:'), h('div', { class: 'kv' }, h('div', {}, h('span', {}, 'Login'), h('b', {}, r.login)), h('div', {}, h('span', {}, 'Temporary password'), h('b', {}, r.temp_password)))), { actions: [{ label: 'Open profile', kind: 'primary', onClick: (y) => { y(); location.hash = `#/employees/${r.employee_id}`; } }] });
      } catch (e) { toast(e.message, 'err'); }
    } }],
  });
}

// ---------- Time & leave ----------
export async function time(el) {
  const manager = role() === 'manager' || isHR();
  const approve = (key) => (row, reload) => (manager && ['Pending', 'Submitted'].includes(row.status) && row.employee_id !== me()
    ? [h('button', { class: 'btn sm', onclick: () => setStatus(key, row.id, 'Rejected', reload) }, 'Reject'), ' ', h('button', { class: 'btn sm primary', onclick: () => setStatus(key, row.id, 'Approved', reload) }, 'Approve')]
    : null);
  el.append(pageHead('Time & leave', manager ? 'Approve timesheets and leave for your people. Approved annual leave is deducted from balances automatically.' : 'Your timesheets and leave.'));
  el.append(tabs([
    { id: 'leave', label: 'Leave requests', render: () => dataTable('leave_requests', { columns: ['employee_id', 'leave_type', 'start_date', 'end_date', 'days', 'status'], filters: ['status', 'leave_type'], rowActions: approve('leave_requests'), hide: ['approver_id', 'requested_on'] }) },
    { id: 'time', label: 'Timesheets', render: () => dataTable('time_entries', { columns: ['employee_id', 'work_date', 'clock_in', 'clock_out', 'hours', 'project', 'status'], filters: ['status', 'project'], rowActions: approve('time_entries'), defaults: { work_date: today(), status: 'Submitted' } }) },
    { id: 'calendar', label: 'Leave calendar', render: () => leaveCalendar() },
    { id: 'balances', label: 'Leave balances', show: isHR(), render: () => balances() },
  ], 'leave'));
}

async function setStatus(key, id, status, reload) {
  try { await api(`r/${key}/${id}`, { method: 'PUT', body: { status } }); toast(`${status}`); reload(); } catch (e) { toast(e.message, 'err'); }
}

function balances() {
  const box = h('div');
  api('r/employees').then((es) => box.append(card('Annual leave balances', h('div', { class: 'table-scroll' }, h('table', { class: 'data plain' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Employee'), h('th', {}, 'Department'), h('th', { class: 'num' }, 'Days left'))),
    h('tbody', {}, es.filter((e) => e.status !== 'Terminated').sort((a, b) => (a.leave_balance ?? 0) - (b.leave_balance ?? 0)).map((e) => h('tr', {}, h('td', {}, `${e.first_name} ${e.last_name}`), h('td', {}, e.department_id__label), h('td', { class: 'num' }, e.leave_balance ?? 0)))))))));
  return box;
}

function leaveCalendar() {
  const box = h('div');
  let month = today().slice(0, 7);
  const draw = async () => {
    const rows = (await api('r/leave_requests')).filter((l) => l.status === 'Approved' || l.status === 'Pending');
    const [y, m] = month.split('-').map(Number);
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const inMonth = rows.filter((l) => l.start_date <= `${month}-${days}` && l.end_date >= `${month}-01`);
    const people = [...new Map(inMonth.map((l) => [l.employee_id, l.employee_id__label])).entries()];
    const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const shift = (n) => { const d = new Date(Date.UTC(y, m - 1 + n, 1)); month = d.toISOString().slice(0, 7); draw(); };
    clear(box).append(card(null, h('div', { class: 'card-title' }, h('span', {}, `Who's off · ${label}`), h('span', {}, h('button', { class: 'btn sm', onclick: () => shift(-1) }, '‹'), ' ', h('button', { class: 'btn sm', onclick: () => shift(1) }, '›'))),
      people.length ? h('div', { class: 'sched' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Employee'), Array.from({ length: days }, (_, i) => h('th', { class: `${month}-${String(i + 1).padStart(2, '0')}` === today() ? 'today' : '' }, i + 1)))),
        h('tbody', {}, people.map(([id, name]) => h('tr', {}, h('td', { class: 'name' }, name), Array.from({ length: days }, (_, i) => {
          const d = `${month}-${String(i + 1).padStart(2, '0')}`;
          const l = inMonth.find((x) => x.employee_id === id && x.start_date <= d && x.end_date >= d);
          const wk = [0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay());
          return h('td', { title: l ? `${l.leave_type} (${l.status})` : '', style: { background: l ? (l.status === 'Approved' ? 'var(--chart)' : 'var(--warn-bg)') : wk ? 'var(--surface-2)' : '' } }, '');
        })))))) : h('p', { class: 'muted' }, 'No approved or pending leave this month.'),
      h('p', { class: 'small muted', style: { marginTop: '8px' } }, h('span', { class: 'badge good' }, 'Approved'), ' ', h('span', { class: 'badge warn' }, 'Pending'), '  Weekends are shaded.')));
  };
  draw();
  return box;
}

// ---------- Scheduling ----------
export async function scheduling(el) {
  const monday = (d) => { const x = new Date(`${d}T00:00:00Z`); const w = (x.getUTCDay() + 6) % 7; x.setUTCDate(x.getUTCDate() - w); return x.toISOString().slice(0, 10); };
  const add = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  let start = monday(today()); let site = '';
  const grid = h('div', { class: 'sched' });
  const title = h('h3');
  const draw = async () => {
    const days = Array.from({ length: 7 }, (_, i) => add(start, i));
    const shifts = (await api('r/shifts')).filter((s) => s.shift_date >= days[0] && s.shift_date <= days[6] && (!site || s.site === site));
    const people = [...new Map(shifts.map((s) => [s.employee_id, s.employee_id__label])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
    title.textContent = `Week of ${date(start)}`;
    const canAdd = can('shifts', 'c');
    clear(grid).append(h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Employee'), days.map((d) => h('th', { class: d === today() ? 'today' : '' }, new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }))))),
      h('tbody', {}, people.length ? people.map(([id, name]) => h('tr', {}, h('td', { class: 'name' }, name), days.map((d) => h('td', {},
        shifts.filter((s) => s.employee_id === id && s.shift_date === d).map((s) => h('div', { class: `shift ${s.start_time >= '12:00' ? 'pm' : ''}`, onclick: () => editRecord('shifts', s, { onSaved: draw }) }, `${s.start_time}–${s.end_time}`, h('small', {}, s.site))),
        canAdd ? h('button', { class: 'cell-add', 'aria-label': `Add shift for ${name} on ${d}`, onclick: () => editRecord('shifts', null, { onSaved: draw, defaults: { employee_id: id, shift_date: d, start_time: '07:00', end_time: '15:00', status: 'Scheduled' } }) }, '+') : null)))) : h('tr', {}, h('td', { colspan: 8, class: 'muted', style: { textAlign: 'center', padding: '24px' } }, 'No shifts this week.')))));
  };
  const sites = h('select', { class: 'inline-input', onchange: (e) => { site = e.target.value; draw(); } }, h('option', { value: '' }, 'All sites'), ['Lagos HQ', 'Lekki Solar Farm', 'Abuja Depot', 'Ikeja Recycling Hub', 'Port Harcourt Office', 'Field'].map((s) => h('option', { value: s }, s)));
  el.append(pageHead('Scheduling', 'Shift rota for installation crews, plant operators and field teams. Morning shifts are green, afternoon shifts gold.',
    sites, h('button', { class: 'btn', onclick: () => { start = add(start, -7); draw(); } }, '‹ Prev'), h('button', { class: 'btn', onclick: () => { start = monday(today()); draw(); } }, 'This week'), h('button', { class: 'btn', onclick: () => { start = add(start, 7); draw(); } }, 'Next ›'),
    can('shifts', 'c') ? h('button', { class: 'btn primary', onclick: () => editRecord('shifts', null, { onSaved: draw, defaults: { shift_date: today(), start_time: '07:00', end_time: '15:00', status: 'Scheduled' } }) }, '+ Add shift') : null));
  el.append(card(null, h('div', { class: 'card-title' }, title), grid));
  draw();
}

// ---------- Assets ----------
export async function assets(el) {
  const all = can('assets', 'r') ? await api('r/assets') : [];
  const by = (s) => all.filter((a) => a.status === s).length;
  const value = all.filter((a) => a.status !== 'Retired').reduce((t, a) => t + Number(a.cost || 0), 0);
  el.append(pageHead('Asset management', 'Company equipment, who has it, and its condition. Offboarding creates return tasks automatically.'));
  if (isHR()) el.append(h('div', { class: 'stats' }, stat('Total assets', all.length), stat('Assigned', by('Assigned')), stat('Available', by('Available')), stat('In repair', by('In repair')), stat('Book value (cost)', money(value, { compact: true }))));
  const tbl = dataTable('assets', {
    columns: ['tag', 'name', 'category', 'status', 'employee_id', 'assigned_date', 'cost'], filters: ['status', 'category'],
    defaults: { status: 'Available', purchase_date: today() },
    rowActions: isHR() ? (row, reload) => (row.status === 'Assigned'
      ? h('button', { class: 'btn sm', onclick: async () => { await api(`r/assets/${row.id}`, { method: 'PUT', body: { employee_id: '', status: 'Available' } }); toast(`${row.tag} returned to stock`); reload(); } }, 'Return')
      : row.status === 'Available' ? h('button', { class: 'btn sm primary', onclick: () => editRecord('assets', row, { onSaved: reload, title: `Assign ${row.tag}` }) }, 'Assign') : null) : null,
  });
  el.append(tbl);
}

export { badge, avatar };
