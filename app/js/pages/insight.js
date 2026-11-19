import { api, money, isHR, can, today, state, num } from '../api.js';
import { h, clear, toast, card, dataTable, tabs, pageHead, stat, barList, columns, progress, badge } from '../ui.js';

const mon = (l) => new Date(`${l}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });

export async function analytics(el) {
  const a = await api('analytics');
  const x = a.headline;
  el.append(pageHead('Workforce analytics', `Live from the central HR database · as of ${new Date(a.as_of).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`,
    h('button', { class: 'btn', onclick: () => window.print() }, 'Print / PDF')));
  el.append(h('div', { class: 'stats' },
    stat('Headcount', x.headcount, `${x.female_share}% women`), stat('Turnover (12 months)', `${x.turnover_rate}%`, 'Leavers ÷ average headcount'),
    stat('Average tenure', `${x.avg_tenure} yrs`, `Average age ${x.avg_age}`), stat('Monthly payroll (gross)', money(x.monthly_payroll, { compact: true }), 'Latest run'),
    stat('eNPS', x.enps == null ? '—' : (x.enps > 0 ? `+${x.enps}` : x.enps), 'Latest pulse survey'), stat('Avg performance rating', x.avg_rating || '—', 'Out of 5'),
    stat('Training completion', `${x.training_completion}%`, `Mandatory: ${x.mandatory_completion}%`), stat('Avg weekly hours', x.avg_weekly_hours, 'Last 4 weeks'),
    stat('Compliance on track', `${x.compliance_on_track}%`, 'Items not overdue', x.compliance_on_track < 90 ? 'alert' : '')));
  const c = (t, node, sub) => card(t, sub ? h('p', { class: 'muted small', style: { marginTop: '-6px' } }, sub) : null, node);
  el.append(h('div', { class: 'grid g2' },
    c('Headcount by department', barList(a.by_department)),
    c('Gross payroll by month', columns(a.payroll_trend.map((p) => ({ label: p.label, value: p.gross })), { format: (v) => money(v, { compact: true }), shortLabel: mon })),
    c('New hires per month', columns(a.hires, { shortLabel: mon }), 'Last 12 months'),
    c('Leavers per month', columns(a.exits, { shortLabel: mon }), 'Last 12 months'),
    c('Payroll cost by department', barList(a.payroll_by_department, { format: (v) => money(v, { compact: true }) }), 'Latest payroll run, gross'),
    c('Recruiting funnel', barList(a.funnel), 'Candidates who reached each stage'),
    c('Headcount by location', barList(a.by_location)),
    c('Age profile', barList(a.by_age)),
    c('Employment type', barList(a.by_type)),
    c('Leave days taken this year', barList(a.leave_by_type, { format: (v) => `${num(v)} days` })),
    c('Performance ratings', barList(a.rating_distribution.slice().reverse().map((r) => ({ label: `Rating ${r.label}`, value: r.value })))),
    c('Gender', barList(a.by_gender))));
}

export async function compliance(el) {
  el.append(pageHead('Compliance', 'Statutory remittances and filings, licences, policy sign-off and the audit trail.'));
  el.append(tabs([
    { id: 'cal', label: 'Compliance calendar', show: can('compliance_items', 'r'), render: () => calendar() },
    { id: 'pol', label: 'Policies & sign-off', render: () => policies() },
    { id: 'audit', label: 'Audit trail', show: isHR(), render: () => dataTable('audit_log', { columns: ['at', 'user_email', 'action', 'entity', 'entity_id', 'details'], filters: [] }) },
  ], 'cal'));
}

function calendar() {
  const box = h('div', { class: 'stack' });
  api('r/compliance_items').then((rows) => {
    const t = today();
    const overdue = rows.filter((r) => r.status !== 'Completed' && r.due_date < t);
    const soon = rows.filter((r) => r.status !== 'Completed' && r.due_date >= t && r.due_date <= new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10));
    box.prepend(h('div', { class: 'stats' }, stat('Obligations tracked', rows.length), stat('Due in 30 days', soon.length), stat('Overdue', overdue.length, overdue.map((o) => o.title).join('; ') || 'None', overdue.length ? 'alert' : ''), stat('Completed', rows.filter((r) => r.status === 'Completed').length)));
  });
  box.append(dataTable('compliance_items', {
    columns: ['title', 'category', 'regulator', 'due_date', 'frequency', 'status', 'owner_id'], filters: ['status', 'category'], defaults: { status: 'Upcoming' },
    rowActions: isHR() ? (row, reload) => (row.status !== 'Completed' ? h('button', { class: 'btn sm', onclick: async () => { await api(`r/compliance_items/${row.id}`, { method: 'PUT', body: { status: 'Completed' } }); toast('Marked complete'); reload(); } }, 'Mark done') : null) : null,
  }));
  return box;
}

function policies() {
  const box = h('div', { class: 'stack' });
  if (isHR()) api('compliance/policies').then((rows) => box.prepend(card('Policy acknowledgement rates', h('ul', { class: 'list' }, rows.filter((p) => p.requires_ack).map((p) => h('li', {}, h('span', { class: 'grow' }, h('div', {}, p.title), h('div', { class: 'sub' }, `v${p.version} · ${p.acks} of ${p.total} employees`)), progress(p.rate), h('b', { style: { width: '44px', textAlign: 'right' } }, `${p.rate}%`)))))));
  box.append(dataTable('policies', { columns: ['title', 'version', 'category', 'effective_date', 'requires_ack'], defaults: { effective_date: today(), requires_ack: 1, version: '1.0' } }));
  return box;
}

// ---------- Settings (admin) ----------
export async function settings(el) {
  const s = await api('settings');
  el.append(pageHead('Settings', 'Company profile, payroll rules, leave policy, lifecycle templates and user accounts.'));
  el.append(tabs([
    { id: 'company', label: 'Company', render: () => companyForm(s) },
    { id: 'payroll', label: 'Payroll & tax', render: () => payrollForm(s) },
    { id: 'leave', label: 'Leave policy', render: () => leaveForm(s) },
    { id: 'templates', label: 'Checklists', render: () => templateForm(s) },
    { id: 'users', label: 'Users & roles', render: () => h('div', { class: 'stack' }, card(null, h('p', { class: 'muted', style: { margin: 0 } }, 'Roles: ', h('b', {}, 'admin'), ' (everything), ', h('b', {}, 'hr'), ' (all HR data, payroll), ', h('b', {}, 'manager'), ' (their reporting line), ', h('b', {}, 'employee'), ' (self-service only).')), dataTable('users', { columns: ['email', 'role', 'employee_id', 'active', 'last_login'], filters: ['role'], defaults: { role: 'employee', active: 1 } })) },
    { id: 'system', label: 'System', render: () => card('System', h('div', { class: 'kv' }, h('div', {}, h('span', {}, 'Database'), h('b', {}, state.meta.db === 'mssql' ? 'Azure SQL Database' : 'Local SQLite (demo)')), h('div', {}, h('span', {}, 'Hosting'), h('b', {}, 'Azure Static Web Apps · go-green-hr')), h('div', {}, h('span', {}, 'Time zone'), h('b', {}, 'Africa/Lagos (WAT)'))), state.meta.db !== 'mssql' ? h('p', { class: 'muted small', style: { marginTop: '10px' } }, 'Set the SQL_CONNECTION_STRING application setting on the Static Web App to switch to Azure SQL. Tables are created and demo data is loaded automatically on first start.') : null) },
  ], 'company'));
}

const save = async (body) => { try { await api('settings', { method: 'PUT', body }); toast('Settings saved'); state.meta = await api('meta'); } catch (e) { toast(e.message, 'err'); } };
const inp = (label, value, attrs = {}) => { const i = h('input', { value: value ?? '', ...attrs }); return [h('label', { class: 'field' }, h('span', {}, label), i), i]; };

function companyForm(s) {
  const c = s.company || {};
  const fields = ['name', 'legal_name', 'address', 'email', 'phone', 'website', 'rc_number', 'tin'].map((k) => [k, ...inp({ name: 'Trading name', legal_name: 'Legal name', address: 'Registered address', email: 'Contact email', phone: 'Phone', website: 'Website', rc_number: 'CAC RC number', tin: 'Company TIN' }[k], c[k])]);
  return card('Company profile', h('div', { class: 'form-grid' }, fields.map((f) => f[1])), h('div', { style: { marginTop: '14px' } }, h('button', { class: 'btn primary', onclick: () => save({ company: { ...c, ...Object.fromEntries(fields.map(([k, , i]) => [k, i.value])) } }) }, 'Save')));
}

function payrollForm(s) {
  const p = JSON.parse(JSON.stringify(s.payroll));
  const [curL, cur] = inp('Currency code (ISO)', p.currency, { maxlength: 3 });
  const [symL, sym] = inp('Currency symbol', p.symbol);
  const [locL, loc] = inp('Number format locale', p.locale);
  const pct = (v) => Math.round(v * 10000) / 100;
  const rate = (label, v) => inp(`${label} (%)`, pct(v), { type: 'number', step: '0.01' });
  const struct = Object.entries(p.structure).map(([k, v]) => [k, ...rate(`${k[0].toUpperCase()}${k.slice(1)} share of gross`, v)]);
  const [peL, pe] = rate('Pension · employee', p.pension_employee_rate);
  const [prL, pr] = rate('Pension · employer', p.pension_employer_rate);
  const [nhL, nh] = rate('NHF (of basic)', p.nhf_rate);
  const nhOn = h('input', { type: 'checkbox', checked: !!p.nhf_enabled });
  const [rrL, rr] = rate('Rent relief', p.rent_relief_rate);
  const [rcL, rc] = inp('Rent relief cap (annual)', p.rent_relief_cap, { type: 'number' });
  const bandsBox = h('tbody');
  const drawBands = () => { clear(bandsBox).append(...p.tax_bands.map((b, i) => h('tr', {},
    h('td', {}, h('input', { class: 'inline-input', type: 'number', value: b.upto ?? '', placeholder: 'No limit', onchange: (e) => { b.upto = e.target.value === '' ? null : Number(e.target.value); } })),
    h('td', {}, h('input', { class: 'inline-input', type: 'number', step: '0.01', value: pct(b.rate), onchange: (e) => { b.rate = Number(e.target.value) / 100; } })),
    h('td', {}, h('button', { class: 'btn sm ghost danger', onclick: () => { p.tax_bands.splice(i, 1); drawBands(); } }, 'Remove'))))); };
  drawBands();
  const submit = () => {
    const structure = Object.fromEntries(struct.map(([k, , i]) => [k, Number(i.value) / 100]));
    const total = Object.values(structure).reduce((a, b) => a + b, 0);
    if (Math.abs(total - 1) > 0.001) return toast(`Salary structure must add up to 100% (now ${Math.round(total * 100)}%)`, 'err');
    save({ payroll: { ...p, currency: cur.value.toUpperCase(), symbol: sym.value, locale: loc.value, structure, pension_employee_rate: Number(pe.value) / 100, pension_employer_rate: Number(pr.value) / 100, nhf_rate: Number(nh.value) / 100, nhf_enabled: nhOn.checked, rent_relief_rate: Number(rr.value) / 100, rent_relief_cap: Number(rc.value), tax_bands: p.tax_bands.slice().sort((a, b) => (a.upto ?? Infinity) - (b.upto ?? Infinity)) } });
  };
  return h('div', { class: 'stack' },
    card('Currency', h('div', { class: 'form-grid' }, curL, symL, locL), h('p', { class: 'muted small', style: { marginTop: '8px' } }, 'Default is Nigerian naira (NGN, ₦, en-NG). Changing currency affects how amounts are shown and calculated from now on; it does not convert existing payroll history.')),
    card('Salary structure & statutory deductions', h('div', { class: 'form-grid' }, struct.map((x) => x[1]), peL, prL, nhL, h('label', { class: 'field check' }, h('span', {}, 'Deduct NHF'), nhOn), rrL, rcL)),
    card('PAYE tax bands (annual chargeable income)', h('table', { class: 'data plain' }, h('thead', {}, h('tr', {}, h('th', {}, 'Band ceiling (cumulative, blank = no limit)'), h('th', {}, 'Rate %'), h('th', {}, ''))), bandsBox),
      h('div', { style: { marginTop: '10px', display: 'flex', gap: '8px' } }, h('button', { class: 'btn sm', onclick: () => { p.tax_bands.push({ upto: null, rate: 0 }); drawBands(); } }, '+ Add band'))),
    h('div', {}, h('button', { class: 'btn primary', onclick: submit }, 'Save payroll settings')));
}

function leaveForm(s) {
  const l = s.leave_policy || {};
  const fs = [['annual_days', 'Annual leave (working days)'], ['carry_over_max', 'Max carry-over days'], ['sick_days', 'Sick leave days'], ['maternity_weeks', 'Maternity leave (weeks)'], ['paternity_days', 'Paternity leave (days)']].map(([k, label]) => [k, ...inp(label, l[k], { type: 'number' })]);
  return card('Leave policy', h('div', { class: 'form-grid' }, fs.map((f) => f[1])), h('p', { class: 'muted small', style: { marginTop: '8px' } }, 'New employees start with the annual leave entitlement. The Labour Act minimum is 6 working days after 12 months of service.'),
    h('div', { style: { marginTop: '14px' } }, h('button', { class: 'btn primary', onclick: () => save({ leave_policy: Object.fromEntries(fs.map(([k, , i]) => [k, Number(i.value)])) }) }, 'Save')));
}

function templateForm(s) {
  const mk = (key, title, list) => {
    const ta = h('textarea', { rows: 12, class: 'inline-input', style: { width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: '12px' } }, list.map((r) => r.join(' | ')).join('\n'));
    return card(title, h('p', { class: 'muted small' }, 'One task per line: Task | Category | Owner | Days from start date (negative = before)'), ta,
      h('div', { style: { marginTop: '10px' } }, h('button', { class: 'btn primary', onclick: () => {
        const rows = ta.value.split('\n').map((x) => x.split('|').map((y) => y.trim())).filter((r) => r[0]).map(([t, c, o, d]) => [t, c || 'Paperwork', o || 'HR', Number(d) || 0]);
        save({ [key]: rows });
      } }, 'Save')));
  };
  return h('div', { class: 'grid g2' }, mk('onboarding_template', 'Onboarding checklist', s.onboarding_template), mk('offboarding_template', 'Offboarding checklist', s.offboarding_template));
}

export { badge };
