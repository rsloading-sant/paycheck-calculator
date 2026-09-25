"use strict";

/* 2026 US payroll figures (single filer). Update yearly. */
const FEDERAL_BRACKETS = [
  [12400, 0.10],
  [50400, 0.12],
  [105700, 0.22],
  [201775, 0.24],
  [256225, 0.32],
  [640600, 0.35],
  [Infinity, 0.37],
];
const STANDARD_DEDUCTION = 16100;

const SS_RATE = 0.062;
const SS_WAGE_BASE = 184500; // 2026

const MEDICARE_RATE = 0.0145;
const EXTRA_MEDICARE_RATE = 0.009;
const EXTRA_MEDICARE_THRESHOLD = 200000; // single filer

const STATE_RATES = { louisiana: 0.03, florida: 0, texas: 0 };
const PERIODS_PER_YEAR = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 };
const PER_LABEL = { weekly: "per week", biweekly: "per paycheck", semimonthly: "per paycheck", monthly: "per month" };

const $ = (id) => document.getElementById(id);
const money = (n) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

function federalIncomeTax(annualGross) {
  const taxable = Math.max(0, annualGross - STANDARD_DEDUCTION);
  let tax = 0;
  let prevCap = 0;
  for (const [cap, rate] of FEDERAL_BRACKETS) {
    if (taxable <= prevCap) break;
    tax += (Math.min(taxable, cap) - prevCap) * rate;
    prevCap = cap;
  }
  return tax;
}

function calculate() {
  const freq = $("frequency").value;
  const state = $("state").value;
  const rate = parseFloat($("rate").value) || 0;
  const hours = parseFloat($("hours").value) || 0;
  const ot = parseFloat($("overtime").value) || 0;
  const periods = PERIODS_PER_YEAR[freq];

  const gross = rate * hours + rate * 1.5 * ot;
  const annualGross = gross * periods;

  const federal = federalIncomeTax(annualGross) / periods;
  const ss = (SS_RATE * Math.min(annualGross, SS_WAGE_BASE)) / periods;
  const medicare =
    (MEDICARE_RATE * annualGross +
      EXTRA_MEDICARE_RATE * Math.max(0, annualGross - EXTRA_MEDICARE_THRESHOLD)) /
    periods;
  const stateTax = (STATE_RATES[state] * annualGross) / periods;

  const totalTax = federal + ss + medicare + stateTax;
  const net = Math.max(0, gross - totalTax);

  $("per-label").textContent = PER_LABEL[freq];
  $("r-gross").textContent = money(gross);
  $("r-federal").textContent = money(federal);
  $("r-ss").textContent = money(ss);
  $("r-medicare").textContent = money(medicare);
  $("r-state").textContent = money(stateTax);
  $("r-net").textContent = money(net);
  $("r-annual-gross").textContent = money(annualGross);
  $("r-annual-net").textContent = money(net * periods);
  $("r-rate").textContent =
    annualGross > 0 ? ((1 - (net * periods) / annualGross) * 100).toFixed(1) + "%" : "0%";

  try {
    localStorage.setItem(
      "paycheck-calc",
      JSON.stringify({ freq, state, rate, hours, ot })
    );
  } catch (e) { /* private mode */ }
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem("paycheck-calc") || "{}");
    if (saved.freq) $("frequency").value = saved.freq;
    if (saved.state) $("state").value = saved.state;
    if (saved.rate != null) $("rate").value = saved.rate;
    if (saved.hours != null) $("hours").value = saved.hours;
    if (saved.ot != null) $("overtime").value = saved.ot;
  } catch (e) { /* ignore */ }
}

$("calc-form").addEventListener("input", calculate);
restore();
calculate();
