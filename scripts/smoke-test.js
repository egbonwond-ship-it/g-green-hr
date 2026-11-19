// End-to-end smoke test against the API router (local SQLite).
//   npm test
process.env.SQLITE_PATH = process.env.SQLITE_PATH || require('path').join(require('os').tmpdir(), `gg-smoke-${Date.now()}.db`);
const { handle } = require('../api/src/lib/router');
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };
const call = async (method, path, body, token) => handle({ method, path: `/api/${path}`, query: {}, body, headers: token ? { 'x-gg-token': token } : {} });
const login = async (email) => (await call('POST', 'auth/login', { email, password: 'GoGreen@2026' })).body.token;
const month = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }).slice(0, 7);

(async () => {
  const bad = await call('POST', 'auth/login', { email: 'hr@gogreen.demo', password: 'nope' });
  ok(bad.status === 401, 'rejects a wrong password');
  const [admin, hr, payroll, mgr, emp] = await Promise.all(['admin', 'hr', 'payroll', 'manager', 'employee'].map((r) => login(`${r}@gogreen.demo`)));
  ok(admin && hr && payroll && mgr && emp, 'all five demo roles can sign in');

  const meta = await call('GET', 'meta', null, emp);
  ok(meta.status === 200 && !meta.body.resources.users && meta.body.resources.leave_requests, 'employee meta hides admin modules');
  ok((await call('GET', 'r/users', null, emp)).status === 403, 'employee cannot list user accounts');
  const people = (await call('GET', 'r/employees', null, emp)).body;
  ok(people.length > 40 && people.filter((p) => p.base_salary != null).length === 1, 'employee sees directory but only their own salary');
  ok((await call('GET', 'r/payslips', null, emp)).body.every((p) => p.employee_id === meta.body.user.employee_id), 'employee sees only own payslips');

  const leave = await call('POST', 'r/leave_requests', { leave_type: 'Annual', start_date: `${month}-03`, end_date: `${month}-07`, status: 'Approved', reason: 'test' }, emp);
  ok(leave.status === 200 && leave.body.status === 'Pending' && leave.body.employee_id === meta.body.user.employee_id, 'employee leave is forced to own + Pending');
  const before = (await call('GET', `r/employees/${meta.body.user.employee_id}`, null, hr)).body.leave_balance;
  const appr = await call('PUT', `r/leave_requests/${leave.body.id}`, { status: 'Approved' }, mgr);
  const after = (await call('GET', `r/employees/${meta.body.user.employee_id}`, null, hr)).body.leave_balance;
  ok(appr.status === 200 && after === before - leave.body.days, 'manager approval deducts leave balance');
  ok((await call('PUT', `r/leave_requests/${leave.body.id}`, { status: 'Rejected' }, emp)).status === 403, 'employee cannot approve leave');

  const c1 = await call('POST', 'me/clock', {}, emp); const c2 = await call('POST', 'me/clock', {}, emp);
  ok(c1.body.clocked_in === true && c2.body.clocked_in === false, 'clock in / clock out works');

  const prof = await call('PUT', `r/employees/${meta.body.user.employee_id}`, { phone: '+234 800 000 0000', base_salary: 99999999 }, emp);
  ok(prof.body.phone === '+234 800 000 0000' && prof.body.base_salary !== 99999999, 'self-service edits allowed fields only');

  const prev = await call('POST', 'payroll/preview', { period: month }, payroll);
  ok(prev.status === 200 && prev.body.length > 40, `payroll preview for ${month} (${prev.body.length} staff)`);
  const s = prev.body[0];
  ok(Math.abs(s.gross - s.pension_employee - s.nhf - s.paye - s.other_deductions - s.net) < 0.05, 'payslip arithmetic balances');
  const run = await call('POST', 'payroll/run', { period: month }, payroll);
  ok(run.status === 200 && run.body.run.status === 'Draft', 'payroll run created as Draft');
  ok((await call('POST', `payroll/runs/${run.body.run.id}/status`, { status: 'Approved' }, payroll)).status === 403, 'four-eyes rule: creator cannot approve');
  ok((await call('POST', `payroll/runs/${run.body.run.id}/status`, { status: 'Approved' }, hr)).body.run.status === 'Approved', 'second HR user approves');
  ok((await call('POST', 'payroll/run', { period: month }, hr)).status === 409, 'approved run is locked');
  ok(!(await call('GET', 'r/payslips', null, emp)).body.some((p) => p.period === month), 'unpaid payslips are hidden from employees');
  await call('POST', `payroll/runs/${run.body.run.id}/status`, { status: 'Paid' }, hr);
  ok((await call('GET', 'r/payslips', null, emp)).body.some((p) => p.period === month), 'payslips released once run is paid');
  ok((await call('POST', 'payroll/preview', { period: month }, emp)).status === 403, 'employee cannot run payroll');

  const cands = (await call('GET', 'r/candidates', null, hr)).body.filter((c) => c.stage === 'Offer');
  const hire = await call('POST', 'recruiting/hire', { candidate_id: cands[0].id, base_salary: 9000000 }, hr);
  ok(hire.status === 200 && hire.body.temp_password, 'hiring a candidate creates employee, login and onboarding');
  const tasks = (await call('GET', 'r/lifecycle_tasks', null, hr)).body.filter((t) => t.employee_id === hire.body.employee_id);
  ok(tasks.length >= 10, `onboarding checklist generated (${tasks.length} tasks)`);
  const newLogin = await call('POST', 'auth/login', { email: hire.body.login, password: hire.body.temp_password });
  ok(newLogin.status === 200, 'new hire can sign in with temporary password');

  const off = await call('POST', 'lifecycle/offboard', { employee_id: hire.body.employee_id, last_day: `${month}-28`, separation_type: 'Resignation', reason: 'test' }, hr);
  ok(off.status === 200, 'offboarding starts');
  await call('POST', 'lifecycle/complete', { kind: 'offboarding', employee_id: hire.body.employee_id }, hr);
  ok((await call('POST', 'auth/login', { email: hire.body.login, password: hire.body.temp_password })).status === 401, 'completed offboarding disables login');

  const an = await call('GET', 'analytics', null, hr);
  ok(an.status === 200 && an.body.headline.headcount > 40 && an.body.payroll_trend.length >= 6, 'analytics returns headcount and payroll trend');
  ok((await call('GET', 'analytics', null, emp)).status === 403, 'employee cannot see analytics');
  const dash = await call('GET', 'dashboard', null, mgr);
  ok(dash.status === 200 && dash.body.approvals && dash.body.team_size > 3, `manager dashboard has team approvals (team ${dash.body.team_size})`);
  ok((await call('GET', 'orgchart', null, emp)).body.length > 40, 'org chart loads');
  ok((await call('GET', 'compliance/policies', null, hr)).body.length === 6, 'policy acknowledgement report');
  ok((await call('GET', 'r/audit_log', null, hr)).body.length > 5, 'audit trail records actions');
  const shiftTeam = (await call('POST', 'r/shifts', { employee_id: 1, shift_date: `${month}-20`, start_time: '07:00', end_time: '15:00' }, mgr));
  ok(shiftTeam.status === 403, 'manager cannot schedule outside their team');
  ok((await call('PUT', 'settings', { leave_policy: { annual_days: 22 } }, hr)).status === 403, 'only admin changes settings');
  ok((await call('PUT', 'settings', { leave_policy: { annual_days: 22 } }, admin)).status === 200, 'admin changes settings');

  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
