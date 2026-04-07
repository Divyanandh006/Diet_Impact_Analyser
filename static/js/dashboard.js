/**
 * dashboard.js  –  Diet Impact Analyser v2.0
 * Fetches /api/history and renders 6 interactive data science charts:
 *   1. Calorie trend (line)
 *   2. All-time macro doughnut
 *   3. Macro area (stacked line)
 *   4. Health score timeline
 *   5. Calorie surplus/deficit (bar)
 *   6. Average nutrient coverage radar
 * Plus stat cards, date filter, and history table.
 */

// ── Config ────────────────────────────────────────────────────────
const USER_TDEE = window.USER_TDEE || null;

Chart.defaults.font.family = "'DM Sans', sans-serif";
Chart.defaults.font.size   = 12;
Chart.defaults.color       = '#94a3b8';

const COLORS = {
  green:  '#10b981',
  violet: '#8b5cf6',
  cyan:   '#06b6d4',
  amber:  '#f59e0b',
  red:    '#ef4444',
  rose:   '#f43f5e',
};

// ── State ─────────────────────────────────────────────────────────
let allLogs   = [];
let chartRefs = {};   // holds Chart instances for destruction on filter
let activeDays = 30;

// ── Bootstrap ─────────────────────────────────────────────────────
(async () => {
  try {
    const res  = await fetch('/api/history');
    const data = await res.json();
    allLogs    = data.logs || [];

    if (!allLogs.length) {
      document.getElementById('emptyDashboard').style.display = 'block';
      return;
    }

    document.getElementById('dashboardContent').style.display = 'block';
    setFilter(30);   // default: last 30 days
  } catch (e) {
    console.error('Dashboard load error:', e);
  }
})();

// ── Date Filter ───────────────────────────────────────────────────
function setFilter(days) {
  activeDays = days;

  // Update pill styles
  document.querySelectorAll('.filter-pill').forEach(p => {
    p.classList.toggle('active', parseInt(p.dataset.days) === days);
  });

  const filtered = filterLogs(days);
  destroyCharts();
  renderAll(filtered);
}

function filterLogs(days) {
  if (!days) return allLogs;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return allLogs.filter(log => new Date(log.date) >= cutoff);
}

function destroyCharts() {
  Object.values(chartRefs).forEach(c => { try { c.destroy(); } catch {} });
  chartRefs = {};
}

// ── Render All ────────────────────────────────────────────────────
function renderAll(logs) {
  renderStatCards(logs);
  renderCalorieTrend(logs);
  renderMacroDoughnut(logs);
  renderMacroArea(logs);
  renderHealthScoreChart(logs);
  renderSurplusChart(logs);
  renderNutrientRadar(logs);
  renderHistoryTable(logs);
}

// ── 1. Stat Cards ─────────────────────────────────────────────────
function renderStatCards(logs) {
  if (!logs.length) return;

  const avgCal   = avg(logs.map(l => l.total_calories));
  const bestDay  = logs.reduce((b, l) => l.health_score > b.health_score ? l : b, logs[0]);
  const streak   = calcStreak(allLogs);   // streak uses all logs
  const totalDays = allLogs.length;

  document.getElementById('statCards').innerHTML = [
    { icon: '🔥', val: Math.round(avgCal),        label: 'Avg Daily Calories' },
    { icon: '🏆', val: `${bestDay.health_score}/100`, label: `Best Score (${fmtDate(bestDay.date)})` },
    { icon: '📅', val: streak + ' days',           label: 'Current Streak' },
    { icon: '📊', val: totalDays,                  label: 'Total Days Logged' },
  ].map(s => `
    <div class="dash-stat-card">
      <div class="ds-icon">${s.icon}</div>
      <div class="ds-val" data-target="${s.val}">${s.val}</div>
      <div class="ds-label">${s.label}</div>
    </div>`).join('');
}

// ── 2. Calorie Trend (Line) ───────────────────────────────────────
function renderCalorieTrend(logs) {
  const labels = logs.map(l => fmtDate(l.date));
  const cals   = logs.map(l => l.total_calories);
  const tdeeArr = logs.map(() => USER_TDEE);

  const ctx = document.getElementById('calorieTrendChart').getContext('2d');
  const datasets = [{
    label: 'Calories',
    data: cals,
    borderColor: COLORS.green,
    backgroundColor: 'rgba(16,185,129,0.08)',
    fill: true,
    tension: 0.4,
    pointRadius: 4,
    pointBackgroundColor: COLORS.green,
    pointHoverRadius: 7,
  }];

  if (USER_TDEE) {
    datasets.push({
      label: `TDEE Goal (${USER_TDEE} kcal)`,
      data: tdeeArr,
      borderColor: COLORS.violet,
      borderDash: [6, 4],
      borderWidth: 1.5,
      pointRadius: 0,
      fill: false,
      tension: 0,
    });
  }

  chartRefs.calorieTrend = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { position: 'bottom', labels: { color: '#94a3b8', boxWidth: 12 } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${Math.round(ctx.parsed.y)} kcal` } }
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { maxTicksLimit: 10, color: '#64748b' } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { callback: v => v + ' kcal', color: '#64748b' }, beginAtZero: true }
      }
    }
  });
}

// ── 3. All-Time Macro Doughnut ────────────────────────────────────
function renderMacroDoughnut(logs) {
  const totalProt = sum(logs.map(l => l.total_protein_g));
  const totalFat  = sum(logs.map(l => l.total_fat_g));
  const totalCarb = sum(logs.map(l => l.total_carbs_g));

  const protCal = totalProt * 4;
  const fatCal  = totalFat  * 9;
  const carbCal = totalCarb * 4;
  const total   = protCal + fatCal + carbCal || 1;

  const ctx = document.getElementById('macroDoughnutChart').getContext('2d');
  chartRefs.macroDoughnut = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Protein', 'Fat', 'Carbohydrates'],
      datasets: [{ data: [protCal, fatCal, carbCal], backgroundColor: [COLORS.green, COLORS.violet, COLORS.amber], borderWidth: 3, borderColor: 'rgba(255,255,255,0.04)', hoverOffset: 8 }]
    },
    options: {
      responsive: true, cutout: '60%',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${Math.round((ctx.parsed / total) * 100)}%` } }
      }
    }
  });

  document.getElementById('macroDoughnutLegend').innerHTML = [
    { label: 'Protein', color: COLORS.green,  pct: pct(protCal, total) },
    { label: 'Fat',     color: COLORS.violet, pct: pct(fatCal,  total) },
    { label: 'Carbs',   color: COLORS.amber,  pct: pct(carbCal, total) },
  ].map(m => `
    <div class="macro-legend-item">
      <div class="legend-dot" style="background:${m.color}"></div>
      <span>${m.label}: <strong>${m.pct}%</strong></span>
    </div>`).join('');
}

// ── 4. Macro Split Area (Stacked Line) ────────────────────────────
function renderMacroArea(logs) {
  const labels = logs.map(l => fmtDate(l.date));
  const ctx    = document.getElementById('macroAreaChart').getContext('2d');
  chartRefs.macroArea = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Protein (g)', data: logs.map(l => l.total_protein_g),  borderColor: COLORS.green,  backgroundColor: 'rgba(16,185,129,0.15)',  fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: COLORS.green },
        { label: 'Carbs (g)',   data: logs.map(l => l.total_carbs_g),    borderColor: COLORS.amber,  backgroundColor: 'rgba(245,158,11,0.15)',  fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: COLORS.amber },
        { label: 'Fat (g)',     data: logs.map(l => l.total_fat_g),      borderColor: COLORS.violet, backgroundColor: 'rgba(139,92,246,0.15)', fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: COLORS.violet },
      ]
    },
    options: {
      responsive: true,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { position: 'bottom', labels: { color: '#94a3b8', boxWidth: 12 } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}g` } }
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { maxTicksLimit: 10, color: '#64748b' } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { callback: v => v + 'g', color: '#64748b' }, beginAtZero: true }
      }
    }
  });
}

// ── 5. Health Score Timeline ──────────────────────────────────────
function renderHealthScoreChart(logs) {
  const labels = logs.map(l => fmtDate(l.date));
  const scores = logs.map(l => l.health_score);
  const colors = scores.map(s => s >= 75 ? COLORS.green : s >= 50 ? COLORS.amber : COLORS.red);

  const ctx = document.getElementById('healthScoreChart').getContext('2d');
  chartRefs.healthScore = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Health Score',
        data: scores,
        backgroundColor: colors,
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` Score: ${ctx.parsed.y}/100` } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 8, color: '#64748b' } },
        y: { min: 0, max: 100, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { callback: v => v + '/100', color: '#64748b' } }
      }
    }
  });
}

// ── 6. Calorie Surplus / Deficit ──────────────────────────────────
function renderSurplusChart(logs) {
  if (!USER_TDEE) {
    document.getElementById('surplusChart').closest('.chart-card').innerHTML = `
      <h6 class="chart-title"><i class="bi bi-bar-chart me-2"></i>Calorie Surplus / Deficit</h6>
      <div style="text-align:center;padding:40px 0;color:var(--text-3);font-size:0.88rem;">
        <div style="font-size:2rem;margin-bottom:12px;">📐</div>
        Complete your <a href="/profile" style="color:var(--green)">profile</a> with height, weight, age &amp; gender to see your surplus/deficit chart.
      </div>`;
    return;
  }

  const labels  = logs.map(l => fmtDate(l.date));
  const diffs   = logs.map(l => Math.round(l.total_calories - USER_TDEE));
  const colors  = diffs.map(d => d > 0 ? 'rgba(239,68,68,0.75)' : 'rgba(16,185,129,0.75)');

  const ctx = document.getElementById('surplusChart').getContext('2d');
  chartRefs.surplus = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Calorie Difference (kcal)',
        data: diffs,
        backgroundColor: colors,
        borderRadius: 5,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const v = ctx.parsed.y;
              return ` ${v > 0 ? '+' : ''}${v} kcal (${v > 0 ? 'Surplus' : 'Deficit'})`;
            }
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 10, color: '#64748b' } },
        y: {
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { callback: v => (v > 0 ? '+' : '') + v + ' kcal', color: '#64748b' }
        }
      }
    },
    plugins: [{
      id: 'zeroLine',
      afterDraw(chart) {
        const { ctx, chartArea, scales } = chart;
        const y = scales.y.getPixelForValue(0);
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(chartArea.left, y); ctx.lineTo(chartArea.right, y); ctx.stroke();
        ctx.restore();
      }
    }]
  });
}

// ── 7. Average Nutrient Coverage Radar ───────────────────────────
function renderNutrientRadar(logs) {
  if (!logs.length) return;

  const RDI = { calories: 2000, protein_g: 50, fat_g: 65, carbs_g: 300, fiber_g: 25, iron_mg: 18, vitamin_c_mg: 90, calcium_mg: 1000 };
  const keys = Object.keys(RDI);
  const keyMap = { calories: 'total_calories', protein_g: 'total_protein_g', fat_g: 'total_fat_g', carbs_g: 'total_carbs_g', fiber_g: 'total_fiber_g', iron_mg: 'total_iron_mg', vitamin_c_mg: 'total_vitamin_c_mg', calcium_mg: 'total_calcium_mg' };
  const labels = { calories:'Calories', protein_g:'Protein', fat_g:'Fat', carbs_g:'Carbs', fiber_g:'Fiber', iron_mg:'Iron', vitamin_c_mg:'Vit C', calcium_mg:'Calcium' };

  const avgPcts = keys.map(k => {
    const field = keyMap[k];
    const average = avg(logs.map(l => l[field] || 0));
    return Math.min(Math.round((average / RDI[k]) * 100), 200);
  });

  const ctx = document.getElementById('nutrientRadarChart').getContext('2d');
  chartRefs.nutrientRadar = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: keys.map(k => labels[k]),
      datasets: [
        { label: 'Avg Coverage', data: avgPcts, backgroundColor: 'rgba(16,185,129,0.15)', borderColor: COLORS.green, borderWidth: 2, pointBackgroundColor: COLORS.green, pointRadius: 4 },
        { label: 'RDI (100%)',   data: Array(keys.length).fill(100), backgroundColor: 'rgba(139,92,246,0.04)', borderColor: COLORS.violet, borderWidth: 1.5, borderDash: [5,4], pointRadius: 0 }
      ]
    },
    options: {
      responsive: true,
      scales: { r: { min: 0, max: 200, ticks: { stepSize: 50, callback: v => v + '%', backdropColor: 'transparent', color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.07)' }, pointLabels: { color: '#94a3b8', font: { size: 11 } } } },
      plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', boxWidth: 12 } } }
    }
  });
}

// ── 8. Macro Line Chart (Separate trends) ─────────────────────────
function renderMacroLineChart(logs) {
  /* This is rendered by macroArea (Chart Row 2) but listed separately
     in the HTML — we render the "Daily Protein, Carbs & Fat Trends"
     as a multi-line chart here */
  const labels = logs.map(l => fmtDate(l.date));
  const ctx    = document.getElementById('macroLineChart').getContext('2d');
  chartRefs.macroLine = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Protein (g)', data: logs.map(l => l.total_protein_g), borderColor: COLORS.green,  backgroundColor: 'transparent', tension: 0.4, pointRadius: 3, borderWidth: 2 },
        { label: 'Carbs (g)',   data: logs.map(l => l.total_carbs_g),   borderColor: COLORS.amber,  backgroundColor: 'transparent', tension: 0.4, pointRadius: 3, borderWidth: 2 },
        { label: 'Fat (g)',     data: logs.map(l => l.total_fat_g),     borderColor: COLORS.violet, backgroundColor: 'transparent', tension: 0.4, pointRadius: 3, borderWidth: 2 },
        { label: 'Fiber (g)',   data: logs.map(l => l.total_fiber_g),   borderColor: COLORS.cyan,   backgroundColor: 'transparent', tension: 0.4, pointRadius: 3, borderWidth: 2 },
      ]
    },
    options: {
      responsive: true,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { position: 'right', labels: { color: '#94a3b8', boxWidth: 12, padding: 16 } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}g` } }
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { maxTicksLimit: 12, color: '#64748b' } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { callback: v => v + 'g', color: '#64748b' }, beginAtZero: true }
      }
    }
  });
}

// Override renderAll to include the macro line too
const _renderAll = renderAll;
function renderAll(logs) {
  renderStatCards(logs);
  renderCalorieTrend(logs);
  renderMacroDoughnut(logs);
  renderMacroArea(logs);
  renderHealthScoreChart(logs);
  renderSurplusChart(logs);
  renderNutrientRadar(logs);
  renderMacroLineChart(logs);
  renderHistoryTable(logs);
}

// ── History Table ─────────────────────────────────────────────────
function renderHistoryTable(logs) {
  const tbody = document.getElementById('historyTableBody');
  if (!tbody) return;
  const sorted = [...logs].sort((a, b) => b.date.localeCompare(a.date));
  tbody.innerHTML = sorted.map(log => {
    const s = log.health_score;
    const sClass = s >= 75 ? 'status-ok' : s >= 50 ? 'status-low' : 'status-high';
    return `
      <tr>
        <td><strong>${fmtDateLong(log.date)}</strong></td>
        <td>${Math.round(log.total_calories)} kcal</td>
        <td>${log.total_protein_g.toFixed(1)}g</td>
        <td>${log.total_fat_g.toFixed(1)}g</td>
        <td>${log.total_carbs_g.toFixed(1)}g</td>
        <td>${log.total_fiber_g.toFixed(1)}g</td>
        <td>${log.total_sugar_g.toFixed(1)}g</td>
        <td><span class="np-status ${sClass}">${s.toFixed(0)}/100</span></td>
      </tr>`;
  }).join('');
}

// ── Utilities ─────────────────────────────────────────────────────
function sum(arr) { return arr.reduce((a, b) => a + (b || 0), 0); }
function avg(arr) { return arr.length ? sum(arr) / arr.length : 0; }
function pct(a, b){ return b ? Math.round((a / b) * 100) : 0; }

function fmtDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}
function fmtDateLong(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function calcStreak(logs) {
  if (!logs.length) return 0;
  const sorted = [...logs].sort((a, b) => b.date.localeCompare(a.date));
  const today  = new Date().toISOString().split('T')[0];
  let streak   = 0;
  let expected = today;

  for (const log of sorted) {
    if (log.date === expected) {
      streak++;
      const d = new Date(expected + 'T00:00:00');
      d.setDate(d.getDate() - 1);
      expected = d.toISOString().split('T')[0];
    } else {
      break;
    }
  }
  return streak;
}
