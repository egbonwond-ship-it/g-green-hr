import { api, money, date, isHR, can, today, num } from '../api.js';
import { h, clear, toast, card, badge, dataTable, tabs, pageHead, modal, stat, confirmBox, columns } from '../ui.js';

const periodLabel = (p) => new Date(`${p}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const csvDownload = (name, rows) => {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const a = h('a', { href: URL.createObjectURL(new Blob([rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv' })), download: name });
  document.body.append(a); a.click(); a.remove();
};

export async function showPayslip(id) {
  const { slip: s, company } = await api(`payroll/payslip/${id}`);
  const row = (l, v, cls = '') => h('tr', { class: cls }, h('td', {}, l), h('td', { class: 'num' }, money(v, { cents: true })));
  const body = h('div', { class: 'payslip' },
    h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', marginBottom: '14px' } },
      h('div', {}, h('h2', {}, company?.name || 'Go-Green Technologies'), h('div', { class: 'muted small' }, company?.address || ''), h('div', { style: { marginTop: '8px' } }, h('b', {}, `Payslip · ${periodLabel(s.period)}`))),
      h('div', { style: { textAlign: 'right' } }, h('div', { class: 'muted small' }, 'Net pay'), h('div', { class: 'net' }, money(s.net, { cents: true })))),
    h('div', { class: 'kv', style: { marginBottom: '14px' } }, [['Employee', s.name], ['Employee no.', s.emp_no], ['Job title', s.job_title], ['Department', s.department], ['Bank', `${s.bank_name || ''} ${s.bank_account || ''}`], ['PFA / RSA PIN', `${s.pension_pfa || ''} ${s.pension_pin || ''}`], ['Tax ID', s.tax_id]].map(([k, v]) => h('div', {}, h('span', {}, k), h('b', {}, v || '—')))),
    h('div', { class: 'grid g2' },
      h('div', {}, h('h3', {}, 'Earnings'), h('table', {}, h('tbody', {}, row('Basic salary', s.basic), row('Housing allowance', s.housing), row('Transport allowance', s.transport), row('Other allowances', s.other_allowance), Number(s.bonus) ? row('Bonus', s.bonus) : null, row('Gross pay', s.gross, 'total')))),
      h('div', {}, h('h3', {}, 'Deductions'), h('table', {}, h('tbody', {}, row('Pension (employee 8%)', s.pension_employee), row('National Housing Fund', s.nhf), row('PAYE tax', s.paye), Number(s.other_deductions) ? row('Other deductions', s.other_deductions) : null,
        row('Total deductions', Number(s.pension_employee) + Number(s.nhf) + Number(s.paye) + Number(s.other_deductions), 'total'))))),
    h('p', { class: 'muted small', style: { marginTop: '14px' } }, `Employer pension contribution: ${money(s.pension_employer, { cents: true })}. Taxable income after reliefs: ${money(s.taxable_income, { cents: true })}.`));
  modal(`Payslip · ${s.name}`, body, { wide: true, actions: [{ label: 'Print / save PDF', onClick: () => window.print() }, { label: 'Close', kind: 'primary', onClick: (c) => c() }] });
}

export async function payroll(el) {
  const [runs, cfg] = await Promise.all([api('r/payroll_runs'), api('payroll/config')]);
  const last = runs[0];
  el.append(pageHead('Payroll', `Monthly payroll in ${cfg.currency} with PAYE, pension and NHF calculated automatically. Rates are editable in Settings.`,
    h('button', { class: 'btn primary', onclick: () => newRun(runs) }, 'Run payroll')));
  if (last) el.append(h('div', { class: 'stats' }, stat(`Last run · ${periodLabel(last.period)}`, money(last.total_net, { compact: true }), `Net pay · ${last.status}`), stat('Gross', money(last.total_gross, { compact: true })), stat('PAYE', money(last.total_paye, { compact: true })), stat('Pension (employee + employer)', money(last.total_pension, { compact: true })), stat('Employees paid', last.employee_count)));
  el.append(tabs([
    { id: 'runs', label: 'Payroll runs', render: () => h('div', { class: 'stack' },
      runs.length > 1 ? card('Gross payroll by month', columns([...runs].reverse().map((r) => ({ label: r.period, value: Number(r.total_gross) })), { format: (v) => money(v, { compact: true }), shortLabel: (l) => new Date(`${l}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }) })) : null,
      dataTable('payroll_runs', { columns: ['period', 'status', 'run_date', 'employee_count', 'total_gross', 'total_paye', 'total_net'], onRow: (r) => { location.hash = `#/payroll/${r.id}`; } })) },
    { id: 'rules', label: 'Tax & statutory rules', render: () => rules(cfg) },
    { id: 'slips', label: 'All payslips', render: () => dataTable('payslips', { columns: ['period', 'employee_id', 'gross', 'paye', 'pension_employee', 'net'], onRow: (r) => showPayslip(r.id) }) },
  ], 'runs'));
}

function rules(cfg) {
  let floor = 0;
  const pct = (v) => `${Math.round(v * 1000) / 10}%`;
  return h('div', { class: 'grid g2' },
    card('PAYE bands (annual chargeable income)', h('table', { class: 'data plain' }, h('thead', {}, h('tr', {}, h('th', {}, 'Band'), h('th', { class: 'num' }, 'Rate'))),
      h('tbody', {}, cfg.tax_bands.map((b) => { const lbl = b.upto == null ? `Above ${money(floor)}` : `${money(floor)} – ${money(b.upto)}`; floor = b.upto; return h('tr', {}, h('td', {}, lbl), h('td', { class: 'num' }, pct(b.rate))); }))),
      h('p', { class: 'muted small', style: { marginTop: '8px' } }, 'Default bands follow the Nigeria Tax Act 2025 (effective 1 January 2026). Confirm with your tax adviser and edit in Settings if rules change.')),
    card('Salary structure & statutory deductions', h('ul', { class: 'list' },
      Object.entries(cfg.structure).map(([k, v]) => h('li', {}, h('span', { class: 'grow' }, `${k[0].toUpperCase()}${k.slice(1)} share of gross`), h('b', {}, pct(v)))),
      h('li', {}, h('span', { class: 'grow' }, 'Pension: employee / employer (on basic + housing + transport)'), h('b', {}, `${pct(cfg.pension_employee_rate)} / ${pct(cfg.pension_employer_rate)}`)),
      h('li', {}, h('span', { class: 'grow' }, 'National Housing Fund (of basic)'), h('b', {}, cfg.nhf_enabled ? pct(cfg.nhf_rate) : 'Off')),
      h('li', {}, h('span', { class: 'grow' }, 'Rent relief'), h('b', {}, `${pct(cfg.rent_relief_rate)} of rent, max ${money(cfg.rent_relief_cap)}`)),
      h('li', {}, h('span', { class: 'grow' }, 'Currency'), h('b', {}, `${cfg.currency} (${cfg.symbol})`)))));
}

async function newRun(runs) {
  const now = today().slice(0, 7);
  const period = h('input', { type: 'month', value: runs.some((r) => r.period === now) ? '' : now, class: 'inline-input' });
  const out = h('div', { style: { marginTop: '12px' } });
  const bonuses = {};
  const preview = async () => {
    if (!period.value) return;
    clear(out).append(h('p', { class: 'muted' }, 'Calculating…'));
    try {
      const rows = await api('payroll/preview', { method: 'POST', body: { period: period.value, extras: bonuses } });
      const sum = (k) => rows.reduce((t, r) => t + r[k], 0);
      clear(out).append(h('div', { class: 'stats' }, stat('Employees', rows.length), stat('Gross', money(sum('gross'), { compact: true })), stat('PAYE', money(sum('paye'), { compact: true })), stat('Net', money(sum('net'), { compact: true }))),
        h('div', { class: 'table-scroll', style: { maxHeight: '340px' } }, h('table', { class: 'data plain' },
          h('thead', {}, h('tr', {}, ['Employee', 'Department', 'Gross', 'Bonus', 'Pension', 'NHF', 'PAYE', 'Net'].map((x, i) => h('th', { class: i > 1 ? 'num' : '' }, x)))),
          h('tbody', {}, rows.map((r) => h('tr', {}, h('td', {}, r.name), h('td', {}, r.department), h('td', { class: 'num' }, money(r.gross)),
            h('td', { class: 'num' }, h('input', { type: 'number', class: 'inline-input', style: { width: '110px', textAlign: 'right' }, value: bonuses[r.employee_id]?.bonus || '', placeholder: '0', onchange: (e) => { bonuses[r.employee_id] = { bonus: Number(e.target.value) || 0 }; preview(); } })),
            h('td', { class: 'num' }, money(r.pension_employee)), h('td', { class: 'num' }, money(r.nhf)), h('td', { class: 'num' }, money(r.paye)), h('td', { class: 'num' }, h('b', {}, money(r.net)))))))));
    } catch (e) { clear(out).append(h('p', { class: 'error' }, e.message)); }
  };
  period.addEventListener('change', preview);
  modal('Run payroll', h('div', {}, h('label', { class: 'field', style: { maxWidth: '240px' } }, h('span', {}, 'Pay period'), period), h('p', { class: 'muted small' }, 'Review the preview, add any one-off bonuses, then create the run as a draft. A second HR user or an admin approves it.'), out), {
    wide: true,
    actions: [{ label: 'Cancel', onClick: (c) => c() }, { label: 'Create draft run', kind: 'primary', onClick: async (c) => {
      try { const r = await api('payroll/run', { method: 'POST', body: { period: period.value, extras: bonuses } }); toast(`Draft payroll for ${period.value} created`); c(); location.hash = `#/payroll/${r.run.id}`; } catch (e) { toast(e.message, 'err'); }
    } }],
  });
  preview();
}

export async function runDetail(el, id) {
  const d = await api(`payroll/runs/${id}`);
  const { run, slips, remittances: rem } = d;
  const reload = () => runDetail(clear(el), id);
  const move = async (status) => { try { await api(`payroll/runs/${id}/status`, { method: 'POST', body: { status } }); toast(`Run ${status.toLowerCase()}`); reload(); } catch (e) { toast(e.message, 'err'); } };
  const acts = [];
  if (run.status === 'Draft') {
    acts.push(h('button', { class: 'btn danger', onclick: async () => { if (await confirmBox('Delete this draft run and its payslips?', 'Delete draft')) { await api(`payroll/runs/${id}/delete`, { method: 'POST' }); toast('Draft deleted'); location.hash = '#/payroll'; } } }, 'Delete draft'));
    acts.push(h('button', { class: 'btn', onclick: async () => { try { await api('payroll/run', { method: 'POST', body: { period: run.period } }); toast('Recalculated'); reload(); } catch (e) { toast(e.message, 'err'); } } }, 'Recalculate'));
    acts.push(h('button', { class: 'btn primary', onclick: () => move('Approved') }, 'Approve'));
  }
  if (run.status === 'Approved') { acts.push(h('button', { class: 'btn', onclick: () => move('Draft') }, 'Reopen')); acts.push(h('button', { class: 'btn primary', onclick: () => move('Paid') }, 'Mark as paid')); }
  acts.push(h('button', { class: 'btn', onclick: () => csvDownload(`bank-schedule-${run.period}.csv`, [['Employee no.', 'Name', 'Bank', 'Account number', 'Net pay', 'Narration'], ...slips.map((s) => [s.emp_no, s.name, s.bank_name, s.bank_account, s.net.toFixed ? s.net.toFixed(2) : s.net, `Salary ${run.period}`])]) }, 'Bank schedule CSV'));
  acts.push(h('button', { class: 'btn', onclick: () => csvDownload(`statutory-schedule-${run.period}.csv`, [['Employee no.', 'Name', 'Location', 'Gross', 'Taxable', 'PAYE', 'PFA', 'RSA PIN', 'Pension (EE)', 'Pension (ER)', 'NHF'], ...slips.map((s) => [s.emp_no, s.name, s.location, s.gross, s.taxable_income, s.paye, s.pension_pfa, s.pension_pin, s.pension_employee, s.pension_employer, s.nhf])]) }, 'Statutory schedule CSV'));

  el.append(h('p', {}, h('a', { href: '#/payroll' }, '← Payroll')));
  el.append(pageHead(`Payroll · ${periodLabel(run.period)}`, h('span', {}, badge(run.status), ` · run on ${date(run.run_date)} · ${run.employee_count} employees`), ...acts));
  el.append(h('div', { class: 'stats' }, stat('Gross pay', money(run.total_gross)), stat('Net pay', money(run.total_net)), stat('PAYE to remit', money(rem.paye)), stat('Pension to remit', money(run.total_pension)), stat('NHF to remit', money(rem.nhf))));
  el.append(h('div', { class: 'grid g2', style: { marginBottom: '16px' } },
    card('Remittances due', h('ul', { class: 'list' },
      h('li', {}, h('span', { class: 'grow' }, h('div', {}, 'PAYE'), h('div', { class: 'sub' }, 'State IRS of residence (LIRS for Lagos) · by the 10th')), h('b', {}, money(rem.paye))),
      h('li', {}, h('span', { class: 'grow' }, h('div', {}, 'National Housing Fund'), h('div', { class: 'sub' }, 'FMBN · within one month')), h('b', {}, money(rem.nhf))),
      h('li', {}, h('span', { class: 'grow' }, h('div', {}, 'NSITF (1% of payroll, employer)'), h('div', { class: 'sub' }, 'Employee Compensation Scheme')), h('b', {}, money(rem.nsitf))),
      h('li', {}, h('span', { class: 'grow' }, h('div', {}, 'ITF levy accrual (1% of payroll)'), h('div', { class: 'sub' }, 'Paid annually by 1 April')), h('b', {}, money(rem.itf))))),
    card('Pension by PFA', h('ul', { class: 'list' }, Object.entries(rem.pension_by_pfa).sort((a, b) => b[1] - a[1]).map(([k, v]) => h('li', {}, h('span', { class: 'grow' }, k), h('b', {}, money(v))))), h('p', { class: 'muted small', style: { marginTop: '8px' } }, 'Employee 8% + employer 10%, remit within 7 working days of paying salaries.'))));
  el.append(card(`Payslips (${slips.length})`, h('div', { class: 'table-scroll' }, h('table', { class: 'data' },
    h('thead', {}, h('tr', {}, ['Employee', 'Department', 'Gross', 'Pension', 'NHF', 'PAYE', 'Net'].map((x, i) => h('th', { class: i > 1 ? 'num' : '' }, x)))),
    h('tbody', {}, slips.map((s) => h('tr', { onclick: () => showPayslip(s.id) }, h('td', {}, s.name), h('td', {}, s.department), ['gross', 'pension_employee', 'nhf', 'paye', 'net'].map((k) => h('td', { class: 'num' }, money(s[k]))))))))));
}

export async function compensation(el) {
  el.append(pageHead('Compensation', isHR() ? 'Salary reviews, promotions and adjustments. Managers propose, HR approves, then applying updates the salary used by payroll.' : 'Propose pay changes for your team. HR reviews every proposal.'));
  const act = (row, reload) => {
    if (!isHR()) return null;
    const go = async (status) => { try { await api(`r/compensation_changes/${row.id}`, { method: 'PUT', body: { status } }); toast(status === 'Applied' ? 'Salary updated for payroll' : `Marked ${status.toLowerCase()}`); reload(); } catch (e) { toast(e.message, 'err'); } };
    if (row.status === 'Proposed') return [h('button', { class: 'btn sm', onclick: () => go('Rejected') }, 'Reject'), ' ', h('button', { class: 'btn sm primary', onclick: () => go('Approved') }, 'Approve')];
    if (row.status === 'Approved') return h('button', { class: 'btn sm primary', onclick: () => go('Applied') }, 'Apply to payroll');
    return null;
  };
  const tbl = dataTable('compensation_changes', { columns: ['employee_id', 'change_type', 'effective_date', 'old_salary', 'new_salary', 'status'], filters: ['status'], rowActions: act, defaults: { effective_date: today(), status: 'Proposed' }, hide: isHR() ? [] : ['old_salary', 'status'] });
  el.append(tbl);
  if (isHR()) {
    const emps = (await api('r/employees')).filter((e) => e.status !== 'Terminated' && e.base_salary);
    const grades = {};
    emps.forEach((e) => { const g = e.grade || '—'; (grades[g] = grades[g] || []).push(Number(e.base_salary)); });
    el.append(h('div', { style: { height: '16px' } }), card('Salary ranges by grade (annual gross)', h('div', { class: 'table-scroll' }, h('table', { class: 'data plain' },
      h('thead', {}, h('tr', {}, ['Grade', 'People', 'Minimum', 'Median', 'Maximum'].map((x, i) => h('th', { class: i ? 'num' : '' }, x)))),
      h('tbody', {}, Object.keys(grades).sort().reverse().map((g) => { const v = grades[g].sort((a, b) => a - b); return h('tr', {}, h('td', {}, g), h('td', { class: 'num' }, v.length), h('td', { class: 'num' }, money(v[0])), h('td', { class: 'num' }, money(v[Math.floor(v.length / 2)])), h('td', { class: 'num' }, money(v[v.length - 1]))); }))))));
  }
}

export async function benefits(el) {
  el.append(pageHead('Benefits administration', 'Health (HMO), pension, life assurance and wellbeing plans, and who is enrolled.'));
  const act = (row, reload) => (isHR() && row.status === 'Pending' ? h('button', { class: 'btn sm primary', onclick: async () => { await api(`r/benefit_enrollments/${row.id}`, { method: 'PUT', body: { status: 'Active' } }); toast('Enrolment activated'); reload(); } }, 'Activate') : null);
  const items = [
    { id: 'plans', label: 'Plans', render: () => dataTable('benefit_plans', { columns: ['name', 'category', 'provider', 'employer_cost', 'employee_cost', 'eligibility', 'active'] }) },
    { id: 'enrol', label: 'Enrolments', show: isHR(), render: () => dataTable('benefit_enrollments', { columns: ['employee_id', 'plan_id', 'coverage', 'dependents', 'start_date', 'status'], filters: ['status', 'plan_id'], rowActions: act, defaults: { start_date: today(), status: 'Active' } }) },
    { id: 'cost', label: 'Cost summary', show: isHR(), render: () => costSummary() },
  ];
  el.append(tabs(items, 'plans'));
}

function costSummary() {
  const box = h('div');
  Promise.all([api('r/benefit_plans'), api('r/benefit_enrollments', { query: { status: 'Active' } })]).then(([plans, en]) => {
    const rows = plans.map((p) => { const n = en.filter((e) => e.plan_id === p.id).length; return { p, n, monthly: n * Number(p.employer_cost || 0) }; });
    const total = rows.reduce((t, r) => t + r.monthly, 0);
    box.append(card(`Employer benefit cost · ${money(total)} per month · ${money(total * 12, { compact: true })} per year`, h('table', { class: 'data plain' },
      h('thead', {}, h('tr', {}, ['Plan', 'Enrolled', 'Employer cost / person', 'Monthly cost'].map((x, i) => h('th', { class: i ? 'num' : '' }, x)))),
      h('tbody', {}, rows.map((r) => h('tr', {}, h('td', {}, r.p.name), h('td', { class: 'num' }, num(r.n)), h('td', { class: 'num' }, money(r.p.employer_cost)), h('td', { class: 'num' }, money(r.monthly))))))));
  });
  return box;
}

export { can };
