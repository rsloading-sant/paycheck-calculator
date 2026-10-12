// Runs as a classic script via Babel standalone (no bundler), so hooks come
// from the React UMD global instead of an import statement.
const { useState, useEffect } = React;

// Verified 2026 top statutory marginal rates (Tax Foundation 2026 table + state DOR/
// legislative confirmations for post-Feb-2026 changes: AR, GA, SC, UT, WV). Local
// income taxes excluded. Last cross-verified Sept 2026.
const STATE_TAXES = {
  AL: { name: "Alabama", rate: 0.05 },
  AK: { name: "Alaska", rate: 0 },
  AZ: { name: "Arizona", rate: 0.025 },
  AR: { name: "Arkansas", rate: 0.037 },
  CA: { name: "California", rate: 0.133 },
  CO: { name: "Colorado", rate: 0.044 },
  CT: { name: "Connecticut", rate: 0.0699 },
  DE: { name: "Delaware", rate: 0.066 },
  FL: { name: "Florida", rate: 0 },
  GA: { name: "Georgia", rate: 0.0499 },
  HI: { name: "Hawaii", rate: 0.11 },
  ID: { name: "Idaho", rate: 0.053 },
  IL: { name: "Illinois", rate: 0.0495 },
  IN: { name: "Indiana", rate: 0.0295 },
  IA: { name: "Iowa", rate: 0.038 },
  KS: { name: "Kansas", rate: 0.0558 },
  KY: { name: "Kentucky", rate: 0.035 },
  LA: { name: "Louisiana", rate: 0.03 },
  ME: { name: "Maine", rate: 0.0915 },
  MD: { name: "Maryland", rate: 0.065 },
  MA: { name: "Massachusetts", rate: 0.09 },
  MI: { name: "Michigan", rate: 0.0425 },
  MN: { name: "Minnesota", rate: 0.0985 },
  MS: { name: "Mississippi", rate: 0.04 },
  MO: { name: "Missouri", rate: 0.047 },
  MT: { name: "Montana", rate: 0.0565 },
  NE: { name: "Nebraska", rate: 0.0455 },
  NV: { name: "Nevada", rate: 0 },
  NH: { name: "New Hampshire", rate: 0 },
  NJ: { name: "New Jersey", rate: 0.1075 },
  NM: { name: "New Mexico", rate: 0.059 },
  NY: { name: "New York", rate: 0.109 },
  NC: { name: "North Carolina", rate: 0.0399 },
  ND: { name: "North Dakota", rate: 0.025 },
  OH: { name: "Ohio", rate: 0.0275 },
  OK: { name: "Oklahoma", rate: 0.045 },
  OR: { name: "Oregon", rate: 0.099 },
  PA: { name: "Pennsylvania", rate: 0.0307 },
  RI: { name: "Rhode Island", rate: 0.0599 },
  SC: { name: "South Carolina", rate: 0.0521 },
  SD: { name: "South Dakota", rate: 0 },
  TN: { name: "Tennessee", rate: 0 },
  TX: { name: "Texas", rate: 0 },
  UT: { name: "Utah", rate: 0.0445 },
  VT: { name: "Vermont", rate: 0.0875 },
  VA: { name: "Virginia", rate: 0.0575 },
  WA: { name: "Washington", rate: 0 },
  WV: { name: "West Virginia", rate: 0.0458 },
  WI: { name: "Wisconsin", rate: 0.0765 },
  WY: { name: "Wyoming", rate: 0 },
};

const OT_MODES = [
  { id: "ot15", label: "Weekly OT — 1.5×" },
  { id: "ot2", label: "Weekly OT — 2×" },
  { id: "dtday", label: "Double-Time Day" },
  { id: "daily8", label: "Daily OT (8hr @ 2×)" },
  { id: "daily8_15", label: "Daily OT (8hr @ 1.5×)" },
  { id: "daily8_manual", label: "Daily OT (Manual 1.5× / 2×)" },
];

// 2026 single-filer brackets (IRS Rev. Proc. 2025-32) applied on top of the $16,100
// standard deduction. Children under 17 are modeled as the W-4 Step 3 credit:
// $2,200 per child (2026 Form W-4), subtracted from tax dollar for dollar and
// never taking tax below $0. Last cross-verified Oct 2026.
const FEDERAL_STD_DEDUCTION = 16100;
const CHILD_CREDIT = 2200;

// Returns weekly figures: tax after credit, and the credit actually used.
function calcFederalTax(gross, children = 0) {
  const annualGross = gross * 52;
  const annual = Math.max(annualGross - FEDERAL_STD_DEDUCTION, 0);
  let tax = 0;
  if (annual <= 12400) tax = annual * 0.10;
  else if (annual <= 50400) tax = 1240 + (annual - 12400) * 0.12;
  else if (annual <= 105700) tax = 5800 + (annual - 50400) * 0.22;
  else if (annual <= 201775) tax = 17966 + (annual - 105700) * 0.24;
  else if (annual <= 256225) tax = 41024 + (annual - 201775) * 0.32;
  else if (annual <= 640600) tax = 58448 + (annual - 256225) * 0.35;
  else tax = 192979.25 + (annual - 640600) * 0.37;
  const credit = Math.min(children * CHILD_CREDIT, tax);
  return { tax: Math.max(tax - credit, 0) / 52, credit: credit / 52 };
}

// Keeps typed values inside sane bounds so odd input (negatives, 9999 hrs) can't produce nonsense.
function clampStr(v, min, max) {
  if (v === "" || v === null || v === undefined) return "";
  const n = parseFloat(v);
  if (isNaN(n)) return "";
  return String(Math.min(Math.max(n, min), max));
}

// States with a single flat rate (shown rate is what's actually applied). Every other
// taxed state is graduated, so the rate shown is its TOP bracket, an upper-end estimate.
const FLAT_RATE_STATES = new Set(["AZ","CO","GA","ID","IL","IN","IA","KY","LA","MI","NC","PA","UT"]);

function fmt(n) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function PaycheckCalculator() {
  const [hours, setHours] = useState(58);
  const [rate, setRate] = useState(56);
  const [calcMode, setCalcMode] = useState("ot15");
  const [dtHours, setDtHours] = useState(8);
  const [ot15Hours, setOt15Hours] = useState(16);
  const [ot2Hours, setOt2Hours] = useState(10);
  const [useCustomStraight, setUseCustomStraight] = useState(false);
  const [customStraight, setCustomStraight] = useState({
    ot15: 40, ot2: 40, dtday: 40, daily8: 32, daily8_15: 32, daily8_manual: 32,
  });
  const [exempt, setExempt] = useState(true);
  const [state, setState] = useState("FL");
  const [perDiemDays, setPerDiemDays] = useState(7);
  const [perDiemRate, setPerDiemRate] = useState(115);
  const [dependents, setDependents] = useState(0);
  const [result, setResult] = useState(null);
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    calculate();
  }, [hours, rate, calcMode, dtHours, ot15Hours, ot2Hours, useCustomStraight, customStraight, exempt, state, perDiemDays, perDiemRate, dependents]);

  function setStraightFor(mode, val) {
    setCustomStraight(prev => ({ ...prev, [mode]: val }));
  }

  function buildTiers(h, r) {
    const tiers = [];
    const straightBase = (mode, fallback) =>
      useCustomStraight ? (parseFloat(customStraight[mode]) || 0) : fallback;

    if (calcMode === "ot15" || calcMode === "ot2") {
      const otMult = calcMode === "ot2" ? 2 : 1.5;
      const threshold = Math.min(straightBase(calcMode, 40), h);
      const straightHours = Math.min(h, threshold);
      const otHoursCalc = Math.max(h - threshold, 0);
      tiers.push({ key: "straight", label: "Straight Time", sub: `${straightHours} hrs × $${fmt(r)}/hr`, hours: straightHours, rate: r });
      tiers.push({ key: "ot", label: `Overtime (${otMult}×)`, sub: `${otHoursCalc} hrs × $${fmt(r * otMult)}/hr`, hours: otHoursCalc, rate: r * otMult });
    } else if (calcMode === "dtday") {
      const dt = Math.min(Math.max(parseFloat(dtHours) || 0, 0), h);
      const remaining = Math.max(h - dt, 0);
      const threshold = Math.min(straightBase("dtday", 40), remaining);
      const straightHours = Math.min(remaining, threshold);
      const otHoursCalc = Math.max(remaining - threshold, 0);
      tiers.push({ key: "straight", label: "Straight Time", sub: `${straightHours} hrs × $${fmt(r)}/hr`, hours: straightHours, rate: r });
      tiers.push({ key: "ot", label: "Overtime (1.5×)", sub: `${otHoursCalc} hrs × $${fmt(r * 1.5)}/hr`, hours: otHoursCalc, rate: r * 1.5 });
      tiers.push({ key: "dt", label: "Double-Time Day (2×)", sub: `${dt} hrs × $${fmt(r * 2)}/hr`, hours: dt, rate: r * 2 });
    } else if (calcMode === "daily8") {
      const threshold = Math.min(straightBase("daily8", 32), h);
      const straightHours = Math.min(h, threshold);
      const doubleHours = Math.max(h - threshold, 0);
      tiers.push({ key: "straight", label: `Straight Time (to ${threshold}hr)`, sub: `${straightHours} hrs × $${fmt(r)}/hr`, hours: straightHours, rate: r });
      tiers.push({ key: "dt", label: "Daily Double Time (2×)", sub: `${doubleHours} hrs × $${fmt(r * 2)}/hr`, hours: doubleHours, rate: r * 2 });
    } else if (calcMode === "daily8_15") {
      const threshold = Math.min(straightBase("daily8_15", 32), h);
      const straightHours = Math.min(h, threshold);
      const otHours = Math.max(h - threshold, 0);
      tiers.push({ key: "straight", label: `Straight Time (to ${threshold}hr)`, sub: `${straightHours} hrs × $${fmt(r)}/hr`, hours: straightHours, rate: r });
      tiers.push({ key: "ot", label: "Overtime (1.5×)", sub: `${otHours} hrs × $${fmt(r * 1.5)}/hr`, hours: otHours, rate: r * 1.5 });
    } else if (calcMode === "daily8_manual") {
      const straightHours = useCustomStraight
        ? Math.min(parseFloat(customStraight.daily8_manual) || 0, h)
        : 32;
      const ot15 = parseFloat(ot15Hours) || 0;
      const ot2 = parseFloat(ot2Hours) || 0;
      tiers.push({ key: "straight", label: `Straight Time (${straightHours} hrs)`, sub: `${straightHours} hrs × $${fmt(r)}/hr`, hours: straightHours, rate: r });
      if (ot15 > 0) tiers.push({ key: "ot15", label: "Overtime (1.5×)", sub: `${ot15} hrs × $${fmt(r * 1.5)}/hr`, hours: ot15, rate: r * 1.5 });
      if (ot2 > 0) tiers.push({ key: "ot2", label: "Double Time (2×)", sub: `${ot2} hrs × $${fmt(r * 2)}/hr`, hours: ot2, rate: r * 2 });
    }
    return tiers.map((t) => ({ ...t, pay: t.hours * t.rate }));
  }

  function calculate() {
    const h = parseFloat(hours) || 0;
    const r = parseFloat(rate) || 0;
    const tiers = buildTiers(h, r);
    const gross = tiers.reduce((s, t) => s + t.pay, 0);

    const ss = gross * 0.062;
    const medicare = gross * 0.0145;
    const fed = exempt ? { tax: 0, credit: 0 } : calcFederalTax(gross, parseInt(dependents) || 0);
    const fedTax = fed.tax;
    const dependentCredit = fed.credit;
    const stateTaxRate = STATE_TAXES[state]?.rate || 0;
    const stateTax = gross * stateTaxRate;
    const totalDeductions = ss + medicare + fedTax + stateTax;
    const netPay = gross - totalDeductions;
    const perDiem = (parseFloat(perDiemDays) || 0) * (parseFloat(perDiemRate) || 0);
    const takeHome = netPay + perDiem;
    const effectiveRate = gross > 0 ? (totalDeductions / gross) * 100 : 0;

    setResult({
      tiers, gross,
      ss, medicare, fedTax, stateTax, totalDeductions,
      netPay, perDiem, takeHome, effectiveRate,
      stateTaxRate, dependentCredit,
    });
    setAnimKey((k) => k + 1);
  }

  const stateInfo = STATE_TAXES[state];
  const noStateTax = stateInfo?.rate === 0;

  const modeSummary = {
    ot15: "1.5× OT",
    ot2: "2× OT",
    dtday: `+${dtHours}h @2× day`,
    daily8: "Daily 8hr @ 2×",
    daily8_15: "Daily 8hr @ 1.5×",
    daily8_manual: `32h + ${ot15Hours}h @1.5× + ${ot2Hours}h @2×`,
  }[calcMode];

  function renderStraightTimeBox(mode, cap, capLabel) {
    if (!useCustomStraight || calcMode !== mode) return null;
    const val = customStraight[mode];
    return (
      <div className="field" style={{ marginBottom: 16 }}>
        <label>Straight-Time Hours</label>
        <input
          type="number"
          value={val}
          onChange={e => {
            const raw = parseFloat(e.target.value);
            const clamped = isNaN(raw) ? "" : Math.min(Math.max(raw, 0), cap);
            setStraightFor(mode, clamped);
          }}
          placeholder="e.g. 40"
          min="0"
          max={cap}
          step="0.25"
        />
        <div className="field-hint">
          Hours paid at base rate before overtime kicks in. Capped at {capLabel}.
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0f",
      fontFamily: "'DM Mono', 'Courier New', monospace",
      color: "#e8e0d0",
      padding: "0",
      margin: "0",
    }}>
      <style>{`
        * { box-sizing: border-box; }

        .calc-container {
          max-width: 860px;
          margin: 0 auto;
          padding: 32px 20px 60px;
        }

        .header {
          text-align: center;
          margin-bottom: 40px;
          position: relative;
        }

        .header-eyebrow {
          font-size: 11px;
          letter-spacing: 0.3em;
          color: #c0963c;
          text-transform: uppercase;
          margin-bottom: 8px;
        }

        .header-title {
          font-family: 'Bebas Neue', sans-serif;
          font-size: clamp(48px, 10vw, 88px);
          letter-spacing: 0.05em;
          line-height: 0.9;
          color: #f0e8d8;
          margin: 0 0 12px;
        }

        .header-title span { color: #c0963c; }

        .header-sub {
          font-size: 12px;
          color: #6a6058;
          letter-spacing: 0.15em;
        }

        .grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 16px;
        }

        @media (max-width: 600px) {
          .grid { grid-template-columns: 1fr; }
          .grid-3 { grid-template-columns: 1fr 1fr !important; }
        }

        .grid-3 {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 16px;
          margin-bottom: 16px;
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .field label {
          font-size: 10px;
          letter-spacing: 0.25em;
          text-transform: uppercase;
          color: #c0963c;
        }

        .field input, .field select {
          background: #12111a;
          border: 1px solid #2a2535;
          color: #f0e8d8;
          font-family: 'DM Mono', monospace;
          font-size: 18px;
          padding: 12px 14px;
          border-radius: 4px;
          outline: none;
          transition: border-color 0.2s;
          width: 100%;
          appearance: none;
          -webkit-appearance: none;
        }

        .field input:focus, .field select:focus {
          border-color: #c0963c;
        }

        .field input::placeholder { color: #3a3540; }

        .field-hint {
          font-size: 10px;
          color: #4a4550;
          letter-spacing: 0.1em;
        }

        .toggle-row {
          display: flex;
          gap: 8px;
          margin-bottom: 16px;
        }

        .toggle-row-4 {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 8px;
          margin-bottom: 16px;
        }

        @media (max-width: 600px) {
          .toggle-row-4 {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        .toggle-btn {
          flex: 1;
          padding: 12px 8px;
          background: #12111a;
          border: 1px solid #2a2535;
          color: #6a6058;
          font-family: 'DM Mono', monospace;
          font-size: 12px;
          letter-spacing: 0.1em;
          cursor: pointer;
          border-radius: 4px;
          transition: all 0.15s;
          text-transform: uppercase;
          text-align: center;
        }

        .toggle-btn.active {
          background: #c0963c;
          border-color: #c0963c;
          color: #0a0a0f;
          font-weight: 500;
        }

        .toggle-btn:hover:not(.active) {
          border-color: #c0963c;
          color: #c0963c;
        }

        .divider {
          border: none;
          border-top: 1px solid #1e1c28;
          margin: 24px 0;
        }

        .result-panel {
          background: #0e0d16;
          border: 1px solid #2a2535;
          border-radius: 6px;
          overflow: hidden;
          margin-top: 8px;
        }

        .result-header {
          background: #161424;
          padding: 16px 24px;
          border-bottom: 1px solid #2a2535;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
        }

        .result-header-title {
          font-size: 10px;
          letter-spacing: 0.3em;
          text-transform: uppercase;
          color: #c0963c;
        }

        .result-header-meta {
          font-size: 10px;
          color: #4a4550;
          letter-spacing: 0.1em;
        }

        .result-body { padding: 24px; }

        .result-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          padding: 8px 0;
          border-bottom: 1px solid #161424;
          font-size: 13px;
          animation: fadeSlide 0.3s ease forwards;
          opacity: 0;
        }

        .result-row:last-child { border-bottom: none; }
        .result-row .label { color: #8a8088; }
        .result-row .value { color: #e8e0d0; font-size: 14px; }
        .result-row .value.deduct { color: #c05050; }
        .result-row .value.exempt-tag { color: #4a8a5a; font-size: 11px; letter-spacing: 0.1em; }
        .result-row .value.none-tag { color: #4a5a8a; font-size: 11px; letter-spacing: 0.1em; }

        .result-total {
          margin-top: 16px;
          padding-top: 16px;
          border-top: 2px solid #2a2535;
        }

        .net-pay-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          padding: 6px 0;
        }

        .net-pay-label {
          font-size: 11px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: #6a6058;
        }

        .net-pay-value {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 28px;
          letter-spacing: 0.05em;
          color: #d4b878;
        }

        .takehome-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          padding: 10px 0 0;
          border-top: 1px solid #c0963c33;
          margin-top: 8px;
        }

        .takehome-label {
          font-size: 11px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: #c0963c;
        }

        .takehome-value {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 42px;
          letter-spacing: 0.05em;
          color: #c0963c;
          line-height: 1;
        }

        .eff-rate-bar {
          margin-top: 20px;
          padding-top: 16px;
          border-top: 1px solid #1e1c28;
        }

        .eff-rate-label {
          font-size: 10px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: #4a4550;
          margin-bottom: 8px;
          display: flex;
          justify-content: space-between;
        }

        .eff-rate-label span { color: #8a8088; }

        .bar-track {
          height: 4px;
          background: #1e1c28;
          border-radius: 2px;
          overflow: hidden;
        }

        .bar-fill {
          height: 100%;
          background: linear-gradient(90deg, #4a8a5a, #c0963c, #c05050);
          border-radius: 2px;
          transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .gross-split {
          display: grid;
          gap: 12px;
          margin-bottom: 16px;
          padding-bottom: 16px;
          border-bottom: 1px solid #1e1c28;
        }

        .split-card {
          background: #12111a;
          border-radius: 4px;
          padding: 12px;
        }

        .split-card .sc-label {
          font-size: 10px;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: #4a4550;
          margin-bottom: 4px;
        }

        .split-card .sc-hours {
          font-size: 11px;
          color: #6a6058;
          margin-bottom: 2px;
        }

        .split-card .sc-pay { font-size: 18px; color: #e8e0d0; }

        .section-label {
          font-size: 10px;
          letter-spacing: 0.25em;
          text-transform: uppercase;
          color: #3a3540;
          margin-bottom: 4px;
        }

        @keyframes fadeSlide {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .signature {
          text-align: center;
          margin-top: 48px;
          animation: fadeSlide 0.8s ease forwards;
        }

        .signature-line {
          height: 1px;
          width: 70%;
          max-width: 360px;
          margin: 0 auto 18px;
          background: linear-gradient(90deg, transparent, #c0963c, transparent);
        }

        .signature-by {
          font-size: 11px;
          letter-spacing: 0.35em;
          text-transform: uppercase;
          color: #6a6058;
          margin-bottom: 2px;
        }

        .signature-name {
          font-family: 'Allura', cursive;
          font-size: clamp(56px, 14vw, 76px);
          line-height: 1.15;
          color: #d4b878;
          text-shadow: 0 0 18px rgba(192, 150, 60, 0.35);
        }

        .signature-version {
          font-size: 11px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: #4a4550;
          margin-top: 2px;
        }

        .footer {
          text-align: center;
          margin-top: 40px;
          font-size: 10px;
          color: #2a2535;
          letter-spacing: 0.15em;
        }

        .badge {
          display: inline-block;
          padding: 3px 8px;
          border-radius: 2px;
          font-size: 10px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .badge-green { background: #1a3a2a; color: #4a9a6a; }
        .badge-red { background: #3a1a1a; color: #c05050; }
        .badge-blue { background: #1a1a3a; color: #5a70c0; }
      `}</style>

      <div className="calc-container">
        <div className="header">
          <div className="header-eyebrow">Field Trades · Weekly Earnings</div>
          <div className="header-title">PAY<span>CHECK</span><br />CALC</div>
          <div className="header-sub">Real wages · No fluff · No guesswork</div>
        </div>

        <div className="grid">
          <div className="field">
            <label>Total Hours Worked</label>
            <input type="number" value={hours} onChange={e => setHours(clampStr(e.target.value, 0, 168))} placeholder="e.g. 58" min="0" max="168" />
          </div>
          <div className="field">
            <label>Base Pay Rate ($/hr)</label>
            <input type="number" value={rate} onChange={e => setRate(clampStr(e.target.value, 0, 1000))} placeholder="e.g. 56" min="0" step="0.25" />
          </div>
        </div>

        <div className="field" style={{ marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <label style={{ marginBottom: 0 }}>Overtime Calculation Method</label>
          <label
            onClick={() => setUseCustomStraight(v => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
              fontSize: 12,
              padding: "6px 10px",
              borderRadius: 6,
              border: `1px solid ${useCustomStraight ? "#c0963c" : "#2a2535"}`,
              background: useCustomStraight ? "rgba(192, 150, 60, 0.15)" : "#12111a",
              color: useCustomStraight ? "#c0963c" : "#6b6b76",
              textTransform: "none",
              letterSpacing: 0,
              transition: "all 0.15s ease",
            }}
          >
            <span
              style={{
                position: "relative",
                width: 34,
                height: 18,
                borderRadius: 999,
                background: useCustomStraight ? "#c0963c" : "#3a3a42",
                transition: "background 0.15s ease",
                flexShrink: 0,
                display: "inline-block",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 2,
                  left: useCustomStraight ? 18 : 2,
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: "#0a0a0f",
                  transition: "left 0.15s ease",
                }}
              />
            </span>
            Customize straight-time hours
          </label>
        </div>
        <div className="toggle-row-4">
          {OT_MODES.map(m => (
            <button key={m.id} className={`toggle-btn ${calcMode === m.id ? "active" : ""}`} onClick={() => setCalcMode(m.id)}>
              {m.label}
            </button>
          ))}
        </div>

        {calcMode === "ot15" && (
          <div className="field-hint" style={{ marginBottom: 16 }}>
            First 40 hrs at base rate, everything beyond that at 1.5×.
          </div>
        )}
        {renderStraightTimeBox("ot15", parseFloat(hours) || 0, "total hours")}
        {calcMode === "ot2" && (
          <div className="field-hint" style={{ marginBottom: 16 }}>
            First 40 hrs at base rate, everything beyond that at 2×.
          </div>
        )}
        {renderStraightTimeBox("ot2", parseFloat(hours) || 0, "total hours")}
        {calcMode === "daily8" && (
          <div className="field-hint" style={{ marginBottom: 16 }}>
            First 32 hrs at base rate, everything beyond that at 2× (double time after 8 hrs/day).
          </div>
        )}
        {renderStraightTimeBox("daily8", parseFloat(hours) || 0, "total hours")}
        {calcMode === "daily8_15" && (
          <div className="field-hint" style={{ marginBottom: 16 }}>
            First 32 hrs at base rate, everything beyond that at 1.5× (overtime after 8 hrs/day).
          </div>
        )}
        {renderStraightTimeBox("daily8_15", parseFloat(hours) || 0, "total hours")}

        {calcMode === "dtday" && (
          <div className="field" style={{ marginBottom: 16 }}>
            <label>Double-Time Hours (specific day)</label>
            <input type="number" value={dtHours} onChange={e => setDtHours(clampStr(e.target.value, 0, 168))} placeholder="e.g. 8" min="0" max={hours} step="0.25" />
            <div className="field-hint">
              These hours are pulled out and paid at 2×. The rest of your {Math.max((parseFloat(hours) || 0) - (parseFloat(dtHours) || 0), 0)} hrs follow the normal 40hr/1.5× rule.
            </div>
          </div>
        )}
        {renderStraightTimeBox(
          "dtday",
          Math.max((parseFloat(hours) || 0) - (parseFloat(dtHours) || 0), 0),
          "hours remaining after Double-Time"
        )}

        {calcMode === "daily8_manual" && (
          <div style={{ marginBottom: 16 }}>
            <div className="field-hint" style={{ marginBottom: 12 }}>
              First {useCustomStraight ? (customStraight.daily8_manual || 0) : 32} hours at base rate. Distribute remaining {Math.max((parseFloat(hours) || 0) - (useCustomStraight ? (parseFloat(customStraight.daily8_manual) || 0) : 32), 0)} hours between 1.5× and 2×.
            </div>
            <div className="grid">
              <div className="field">
                <label>Hours at 1.5×</label>
                <input type="number" value={ot15Hours} onChange={e => setOt15Hours(clampStr(e.target.value, 0, 168))} placeholder="e.g. 16" min="0" step="0.25" />
              </div>
              <div className="field">
                <label>Hours at 2×</label>
                <input type="number" value={ot2Hours} onChange={e => setOt2Hours(clampStr(e.target.value, 0, 168))} placeholder="e.g. 10" min="0" step="0.25" />
              </div>
            </div>
          </div>
        )}
        {renderStraightTimeBox("daily8_manual", parseFloat(hours) || 0, "total hours")}

        <div className="field" style={{ marginBottom: 8 }}>
          <label>Federal Income Tax</label>
        </div>
        <div className="toggle-row">
          {[true, false].map(e => (
            <button key={String(e)} className={`toggle-btn ${exempt === e ? "active" : ""}`} onClick={() => setExempt(e)}>
              {e ? "Exempt (W-4 Exempt)" : "Withheld (Standard)"}
            </button>
          ))}
        </div>

        {!exempt && (
          <div className="field" style={{ marginBottom: 16 }}>
            <label>Children Under 17</label>
            <input type="number" value={dependents} onChange={e => setDependents(clampStr(e.target.value, 0, 20))} placeholder="0" min="0" max="20" step="1" />
            <div style={{ fontSize: 10, color: "#4a4550", marginTop: 4, letterSpacing: "0.1em" }}>
              Each child under 17 cuts withholding by $2,200/yr (W-4 Step 3 credit)
            </div>
          </div>
        )}

        <div className="field" style={{ marginBottom: 16 }}>
          <label>State</label>
          <select value={state} onChange={e => setState(e.target.value)}>
            {Object.entries(STATE_TAXES).sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([code, info]) => (
              <option key={code} value={code}>
                {info.name} {info.rate === 0 ? "(No State Tax)" : `(${(info.rate * 100).toFixed(2)}%${FLAT_RATE_STATES.has(code) ? "" : " top rate"})`}
              </option>
            ))}
          </select>
        </div>

        <div className="grid">
          <div className="field">
            <label>Per Diem Rate ($/day)</label>
            <input type="number" value={perDiemRate} onChange={e => setPerDiemRate(clampStr(e.target.value, 0, 1000))} placeholder="e.g. 115" min="0" />
          </div>
          <div className="field">
            <label>Per Diem Days</label>
            <input type="number" value={perDiemDays} onChange={e => setPerDiemDays(clampStr(e.target.value, 0, 7))} placeholder="e.g. 7" min="0" max="7" />
          </div>
        </div>

        <hr className="divider" />

        {result && (
          <div className="result-panel" key={animKey}>
            <div className="result-header">
              <div className="result-header-title">Weekly Paycheck Summary</div>
              <div className="result-header-meta">
                {hours}h · ${rate}/hr · {modeSummary} · {stateInfo?.name}
                &nbsp;·&nbsp;
                <span className={`badge ${exempt ? "badge-green" : "badge-red"}`}>
                  {exempt ? "Exempt" : "Withheld"}
                </span>
              </div>
            </div>

            <div className="result-body">
              <div className="section-label">Earnings Breakdown</div>
              <div className="gross-split" style={{ gridTemplateColumns: `repeat(${result.tiers.length}, 1fr)` }}>
                {result.tiers.map(t => (
                  <div className="split-card" key={t.key}>
                    <div className="sc-label">{t.label}</div>
                    <div className="sc-hours">{t.sub}</div>
                    <div className="sc-pay">${fmt(t.pay)}</div>
                  </div>
                ))}
              </div>

              <div className="result-row" style={{ animationDelay: "0ms" }}>
                <span className="label">Gross Pay</span>
                <span className="value">${fmt(result.gross)}</span>
              </div>

              <div className="result-row" style={{ animationDelay: "40ms" }}>
                <span className="label">Federal Income Tax</span>
                <span className={`value ${exempt ? "exempt-tag" : "deduct"}`}>
                  {exempt ? "EXEMPT" : `-$${fmt(result.fedTax)}`}
                </span>
              </div>

              {!exempt && result.dependentCredit > 0 && (
                <div className="result-row" style={{ animationDelay: "60ms" }}>
                  <span className="label" style={{ paddingLeft: 12, color: "#3a5a4a" }}>
                    ↳ Child Credit ({dependents} × $2,200/yr)
                  </span>
                  <span className="value" style={{ color: "#4a8a5a", fontSize: 12 }}>
                    -${fmt(result.dependentCredit)}/wk off tax
                  </span>
                </div>
              )}

              <div className="result-row" style={{ animationDelay: "80ms" }}>
                <span className="label">
                  {stateInfo?.name} State Tax
                  {noStateTax && <span style={{ fontSize: 10, marginLeft: 6, color: "#4a5a8a" }}>(none)</span>}
                  {!noStateTax && !FLAT_RATE_STATES.has(state) && <span style={{ fontSize: 10, marginLeft: 6, color: "#4a5a8a" }}>(top-rate est.)</span>}
                </span>
                <span className={`value ${noStateTax ? "none-tag" : "deduct"}`}>
                  {noStateTax ? "NO STATE TAX" : `-$${fmt(result.stateTax)}`}
                </span>
              </div>

              <div className="result-row" style={{ animationDelay: "120ms" }}>
                <span className="label">Social Security (6.2%, up to $184,500/yr)</span>
                <span className="value deduct">-${fmt(result.ss)}</span>
              </div>

              <div className="result-row" style={{ animationDelay: "160ms" }}>
                <span className="label">Medicare (1.45%)</span>
                <span className="value deduct">-${fmt(result.medicare)}</span>
              </div>

              <div className="result-row" style={{ animationDelay: "200ms" }}>
                <span className="label">Total Deductions</span>
                <span className="value deduct">-${fmt(result.totalDeductions)}</span>
              </div>

              <div className="result-total">
                <div className="net-pay-row">
                  <span className="net-pay-label">Net Pay (wages)</span>
                  <span className="net-pay-value">${fmt(result.netPay)}</span>
                </div>

                {result.perDiem > 0 && (
                  <div className="result-row" style={{ animationDelay: "240ms", borderBottom: "none" }}>
                    <span className="label">Per Diem ({perDiemDays}d × ${perDiemRate}) — non-taxable</span>
                    <span className="value" style={{ color: "#4a8a5a" }}>+${fmt(result.perDiem)}</span>
                  </div>
                )}

                <div className="takehome-row">
                  <span className="takehome-label">Total Take-Home</span>
                  <span className="takehome-value">${fmt(result.takeHome)}</span>
                </div>
              </div>

              <div className="eff-rate-bar">
                <div className="eff-rate-label">
                  <span>Effective Tax Rate</span>
                  <span>{result.effectiveRate.toFixed(2)}%</span>
                </div>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${Math.min(result.effectiveRate * 2.5, 100)}%` }} />
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="signature">
          <div className="signature-line" />
          <div className="signature-by">Built by</div>
          <div className="signature-name">Santana</div>
          <div className="signature-version">v2.0 · Oct 2026</div>
        </div>

        <div className="footer">
          PAYCHECK CALC · FOR INFORMATIONAL USE ONLY · NOT TAX ADVICE<br />
          Federal withholding estimated via 2026 IRS brackets (Rev. Proc. 2025-32)<br />
          State tax is a flat or top-bracket estimate · Social Security stops after $184,500 earned in the year (2026)
        </div>
      </div>
    </div>
  );
}
