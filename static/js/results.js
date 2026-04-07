/**
 * results.js  –  Diet Impact Analyser v2.0
 * Reads analysis from sessionStorage and renders all charts + tables + suggestions.
 * Shows "Saved" banner if data was persisted to DB.
 */

// ── Load Data ────────────────────────────────────────────────────
const raw        = sessionStorage.getItem('dietAnalysis');
const logDate    = sessionStorage.getItem('logDate')    || '';
const saveStatus = sessionStorage.getItem('saveStatus') || '';

const noDataSection = document.getElementById('noDataSection');
const resultsMain   = document.getElementById('resultsMain');

if (!raw) {
  noDataSection.classList.remove('d-none');
} else {
  resultsMain.classList.remove('d-none');
  const D = JSON.parse(raw);

  // Show saved banner
  if (saveStatus === 'created' || saveStatus === 'updated') {
    const wrapper = document.getElementById('savedBannerWrapper');
    wrapper.style.display = 'block';
    const dateDisplay = document.getElementById('savedDateDisplay');
    if (logDate) {
      const formatted = new Date(logDate + 'T00:00:00').toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
      dateDisplay.textContent = `— ${formatted}`;
    }
  }

  // Set result date label
  if (logDate) {
    const formatted = new Date(logDate + 'T00:00:00').toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
    document.getElementById('resultDateLabel').textContent = `Nutritional breakdown for ${formatted}`;
  }

  render(D);
}

// ── Chart.js Defaults ────────────────────────────────────────────
Chart.defaults.font.family = "'DM Sans', sans-serif";
Chart.defaults.font.size   = 12;
Chart.defaults.color       = '#94a3b8';

// ── Colour Palettes ──────────────────────────────────────────────
const PALETTE      = ['#10b981','#8b5cf6','#f59e0b','#ef4444','#06b6d4','#ec4899','#84cc16','#f97316','#14b8a6','#a855f7'];
const MACRO_COLORS = ['#10b981', '#8b5cf6', '#f59e0b'];

// ── Main Render ───────────────────────────────────────────────────
function render(D) {
  renderHealthScore(D.summary);
  renderSummaryCards(D.totals, D.summary, D.status);
  renderMacroChart(D.macros);
  renderNutrientBarChart(D.comparison, D.labels);
  renderRadarChart(D.comparison, D.labels);
  renderCalorieBarChart(D.items);
  renderProgressBars(D.totals, D.rdi, D.comparison, D.status, D.labels);
  renderResultsTable(D.items, D.totals);
  renderSuggestions(D.suggestions);
}

// ── Health Score Badge ────────────────────────────────────────────
function renderHealthScore(summary) {
  const badge = document.getElementById('healthScoreBadge');
  const score = summary.health_score;
  let cls, label;
  if (score >= 75)     { cls = 'score-excellent'; label = `🌟 Health Score: ${score}/100 — Excellent!`; }
  else if (score >= 50){ cls = 'score-good';      label = `👍 Health Score: ${score}/100 — Good`; }
  else                 { cls = 'score-poor';      label = `⚠️ Health Score: ${score}/100 — Needs Work`; }
  badge.className   = `health-score-badge mx-auto ${cls}`;
  badge.textContent = label;
}

// ── Summary Cards ─────────────────────────────────────────────────
function renderSummaryCards(totals, summary, status) {
  const cards = [
    { value: totals.calories,  unit: 'kcal', label: 'Total Calories',  pct: summary.calorie_pct, key: 'calories'  },
    { value: totals.protein_g, unit: 'g',    label: 'Protein',         pct: summary.protein_pct, key: 'protein_g' },
    { value: totals.fat_g,     unit: 'g',    label: 'Total Fat',       pct: summary.fat_pct,     key: 'fat_g'     },
    { value: totals.carbs_g,   unit: 'g',    label: 'Carbohydrates',   pct: summary.carb_pct,    key: 'carbs_g'   },
  ];
  document.getElementById('summaryCards').innerHTML = cards.map(c => {
    const s = status[c.key];
    const pctClass = s === 'ok' ? 'pct-ok' : s === 'low' ? 'pct-low' : 'pct-high';
    const pctLabel = s === 'ok' ? '✓ On target' : s === 'low' ? '↓ Below RDI' : '↑ Above RDI';
    return `
      <div class="col-6 col-lg-3">
        <div class="summary-card">
          <div class="s-value">${c.value}<small style="font-size:1rem;font-weight:400"> ${c.unit}</small></div>
          <div class="s-label">${c.label}</div>
          <div class="s-pct ${pctClass}">${c.pct}% of RDI &nbsp;·&nbsp; ${pctLabel}</div>
        </div>
      </div>`;
  }).join('');
}

// ── Macro Pie Chart ───────────────────────────────────────────────
function renderMacroChart(macros) {
  const ctx = document.getElementById('macroChart').getContext('2d');
  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Protein', 'Fat', 'Carbohydrates'],
      datasets: [{ data: [macros.protein_cal, macros.fat_cal, macros.carb_cal], backgroundColor: MACRO_COLORS, borderWidth: 3, borderColor: 'rgba(255,255,255,0.05)', hoverOffset: 8 }]
    },
    options: {
      responsive: true, cutout: '65%',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed} kcal` } }
      }
    }
  });
  document.getElementById('macroLegend').innerHTML = [
    { label: 'Protein',       color: MACRO_COLORS[0], pct: macros.protein_pct },
    { label: 'Fat',           color: MACRO_COLORS[1], pct: macros.fat_pct },
    { label: 'Carbohydrates', color: MACRO_COLORS[2], pct: macros.carb_pct },
  ].map(m => `
    <div class="macro-legend-item">
      <div class="legend-dot" style="background:${m.color}"></div>
      <span>${m.label}: <strong>${m.pct}%</strong></span>
    </div>`).join('');
}

// ── Nutrient Bar Chart ────────────────────────────────────────────
function renderNutrientBarChart(comparison, labels) {
  const keys   = ['calories','protein_g','fat_g','carbs_g','fiber_g','sugar_g','sodium_mg','vitamin_c_mg','calcium_mg','iron_mg'];
  const values = keys.map(k => Math.min(comparison[k] || 0, 200));
  const colors = values.map(v => v < 70 ? '#f59e0b' : v > 110 ? '#ef4444' : '#10b981');

  const ctx = document.getElementById('nutrientBarChart').getContext('2d');
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: keys.map(k => labels[k] || k),
      datasets: [{ label: '% of RDI', data: values, backgroundColor: colors, borderRadius: 6, borderSkipped: false }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y.toFixed(1)}% of RDI` } }
      },
      scales: {
        y: { min: 0, max: 200, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { callback: v => v + '%', color: '#64748b' } },
        x: { grid: { display: false }, ticks: { maxRotation: 45, color: '#64748b' } }
      }
    },
    plugins: [{
      id: 'rdiLine',
      afterDraw(chart) {
        const { ctx, chartArea, scales } = chart;
        const y = scales.y.getPixelForValue(100);
        ctx.save();
        ctx.strokeStyle = '#8b5cf6'; ctx.lineWidth = 1.5; ctx.setLineDash([6,4]);
        ctx.beginPath(); ctx.moveTo(chartArea.left, y); ctx.lineTo(chartArea.right, y); ctx.stroke();
        ctx.fillStyle = '#8b5cf6'; ctx.font = 'bold 11px DM Sans';
        ctx.fillText('RDI 100%', chartArea.right - 62, y - 6);
        ctx.restore();
      }
    }]
  });
}

// ── Radar Chart ───────────────────────────────────────────────────
function renderRadarChart(comparison, labels) {
  const keys = ['calories','protein_g','fat_g','carbs_g','fiber_g','iron_mg','vitamin_c_mg','calcium_mg'];
  const ctx  = document.getElementById('radarChart').getContext('2d');
  new Chart(ctx, {
    type: 'radar',
    data: {
      labels: keys.map(k => (labels[k] || k).replace(' (g)','').replace(' (mg)','')),
      datasets: [
        { label: 'Your Intake', data: keys.map(k => Math.min(comparison[k] || 0, 200)), backgroundColor: 'rgba(16,185,129,0.15)', borderColor: '#10b981', borderWidth: 2, pointBackgroundColor: '#10b981', pointRadius: 4 },
        { label: 'RDI (100%)',  data: Array(keys.length).fill(100), backgroundColor: 'rgba(139,92,246,0.05)', borderColor: '#8b5cf6', borderWidth: 1.5, borderDash: [5,4], pointRadius: 0 }
      ]
    },
    options: {
      responsive: true,
      scales: { r: { min: 0, max: 200, ticks: { stepSize: 50, callback: v => v + '%', color: '#64748b', backdropColor: 'transparent' }, grid: { color: 'rgba(255,255,255,0.07)' }, pointLabels: { font: { size: 11 }, color: '#94a3b8' } } },
      plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', boxWidth: 12 } } }
    }
  });
}

// ── Calorie Per Food Bar Chart ─────────────────────────────────────
function renderCalorieBarChart(items) {
  const sorted = [...items].sort((a, b) => b.calories - a.calories);
  const ctx = document.getElementById('calorieBarChart').getContext('2d');
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sorted.map(i => i.food_name),
      datasets: [{ label: 'Calories (kcal)', data: sorted.map(i => i.calories), backgroundColor: sorted.map((_, i) => PALETTE[i % PALETTE.length]), borderRadius: 6, borderSkipped: false }]
    },
    options: {
      indexAxis: 'y', responsive: true,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.x} kcal` } } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { callback: v => v + ' kcal', color: '#64748b' } },
        y: { grid: { display: false }, ticks: { color: '#94a3b8' } }
      }
    }
  });
}

// ── Nutrient Progress Bars ────────────────────────────────────────
function renderProgressBars(totals, rdi, comparison, status, labels) {
  const keys = ['calories','protein_g','fat_g','carbs_g','fiber_g','sugar_g','sodium_mg','vitamin_c_mg','calcium_mg','iron_mg'];
  document.getElementById('nutrientProgressGrid').innerHTML = keys.map(key => {
    const val  = totals[key]      || 0;
    const rec  = rdi[key]         || 1;
    const pct  = comparison[key]  || 0;
    const s    = status[key]      || 'ok';
    const barW = Math.min(pct, 100);
    const unit = key.includes('_mg') ? 'mg' : key === 'calories' ? 'kcal' : 'g';
    return `
      <div class="nutrient-progress-item">
        <div class="np-header">
          <span class="np-name">${labels[key] || key}</span>
          <span class="np-status status-${s}">${s.toUpperCase()}</span>
        </div>
        <div class="progress mb-1">
          <div class="progress-bar bar-${s}" style="width:${barW}%"></div>
        </div>
        <div class="np-values">${val} ${unit} consumed &nbsp;/&nbsp; ${rec} ${unit} recommended (${pct}%)</div>
      </div>`;
  }).join('');
}

// ── Results Table ─────────────────────────────────────────────────
function renderResultsTable(items, totals) {
  document.getElementById('resultsTableBody').innerHTML = items.map(i => `
    <tr>
      <td><strong>${i.food_name}</strong></td>
      <td><span class="cat-chip cat-${(i.category || '').split(' ')[0]}">${i.category}</span></td>
      <td>${i.quantity_g}g</td>
      <td>${i.calories}</td><td>${i.protein_g}</td><td>${i.fat_g}</td>
      <td>${i.carbs_g}</td><td>${i.fiber_g}</td><td>${i.sugar_g}</td><td>${i.sodium_mg}</td>
    </tr>`).join('');

  document.getElementById('resultsTableFoot').innerHTML = `
    <tr>
      <td colspan="3"><strong>TOTAL</strong></td>
      <td><strong>${totals.calories}</strong></td>
      <td><strong>${totals.protein_g}</strong></td>
      <td><strong>${totals.fat_g}</strong></td>
      <td><strong>${totals.carbs_g}</strong></td>
      <td><strong>${totals.fiber_g}</strong></td>
      <td><strong>${totals.sugar_g}</strong></td>
      <td><strong>${totals.sodium_mg}</strong></td>
    </tr>`;
}

// ── Suggestions ───────────────────────────────────────────────────
function renderSuggestions(suggestions) {
  document.getElementById('suggestionsGrid').innerHTML = suggestions.map(s => `
    <div class="col-md-6 col-lg-4">
      <div class="suggestion-card">
        <div class="suggestion-icon">${s.icon}</div>
        <div>
          <div class="suggestion-nutrient">${s.nutrient}</div>
          <div class="suggestion-message">${s.message}</div>
        </div>
      </div>
    </div>`).join('');
}
