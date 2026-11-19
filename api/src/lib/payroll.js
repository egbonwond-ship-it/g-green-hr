// Payroll engine. Defaults follow Nigeria's PAYE rules under the Nigeria Tax Act 2025
// (effective 1 Jan 2026). Every rate, band and the currency are stored in the
// `payroll` setting and can be changed from Settings in the app.
const DEFAULT_PAYROLL = {
  currency: 'NGN',
  symbol: '₦',
  locale: 'en-NG',
  structure: { basic: 0.5, housing: 0.25, transport: 0.1, other: 0.15 },
  pension_employee_rate: 0.08,
  pension_employer_rate: 0.1,
  pension_base: ['basic', 'housing', 'transport'],
  nhf_enabled: true,
  nhf_rate: 0.025, // of basic
  rent_relief_rate: 0.2,
  rent_relief_cap: 500000,
  tax_bands: [ // annual chargeable income; `upto` is the cumulative ceiling, null = no ceiling
    { upto: 800000, rate: 0 },
    { upto: 3000000, rate: 0.15 },
    { upto: 12000000, rate: 0.18 },
    { upto: 25000000, rate: 0.21 },
    { upto: 50000000, rate: 0.23 },
    { upto: null, rate: 0.25 },
  ],
  pay_day: 25,
};

const r2 = (n) => Math.round(n * 100) / 100;

function annualTax(chargeable, bands) {
  let tax = 0; let floor = 0;
  for (const b of bands) {
    const ceil = b.upto == null ? Infinity : Number(b.upto);
    if (chargeable <= floor) break;
    tax += (Math.min(chargeable, ceil) - floor) * Number(b.rate);
    floor = ceil;
  }
  return Math.max(0, tax);
}

// Monthly payslip for one employee. `extra` = { bonus, other_deductions } for the month.
function computePayslip(emp, cfg, extra = {}) {
  const c = { ...DEFAULT_PAYROLL, ...cfg };
  const annual = Number(emp.base_salary) || 0;
  const s = c.structure;
  const parts = {
    basic: (annual * s.basic) / 12,
    housing: (annual * s.housing) / 12,
    transport: (annual * s.transport) / 12,
    other_allowance: (annual * s.other) / 12,
  };
  const bonus = Number(extra.bonus) || 0;
  const gross = parts.basic + parts.housing + parts.transport + parts.other_allowance + bonus;
  const pensionBase = c.pension_base.reduce((t, k) => t + (parts[k] || 0), 0);
  const pension_employee = pensionBase * c.pension_employee_rate;
  const pension_employer = pensionBase * c.pension_employer_rate;
  const nhf = c.nhf_enabled ? parts.basic * c.nhf_rate : 0;
  const rentRelief = Math.min((Number(emp.annual_rent) || 0) * c.rent_relief_rate, c.rent_relief_cap) / 12;
  const taxable = Math.max(0, gross - pension_employee - nhf - rentRelief);
  const paye = annualTax(taxable * 12, c.tax_bands) / 12;
  const other_deductions = Number(extra.other_deductions) || 0;
  const net = gross - pension_employee - nhf - paye - other_deductions;
  return {
    basic: r2(parts.basic), housing: r2(parts.housing), transport: r2(parts.transport),
    other_allowance: r2(parts.other_allowance), bonus: r2(bonus), gross: r2(gross),
    pension_employee: r2(pension_employee), pension_employer: r2(pension_employer), nhf: r2(nhf),
    taxable_income: r2(taxable), paye: r2(paye), other_deductions: r2(other_deductions), net: r2(net),
  };
}

module.exports = { DEFAULT_PAYROLL, computePayslip, annualTax };
