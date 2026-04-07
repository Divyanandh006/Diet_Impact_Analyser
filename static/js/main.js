/**
 * main.js  –  Diet Impact Analyser v2.0
 * Handles: food search, log management, date selection,
 *          live nutrition bar, save-to-database, and analysis navigation.
 */

// ── State ────────────────────────────────────────────────────────
let foodLog      = [];
let searchTimeout= null;
let selectedDate = document.getElementById('logDate')?.value || new Date().toISOString().split('T')[0];
const USER_TDEE  = window.USER_TDEE || 2000;

// ── DOM Refs ─────────────────────────────────────────────────────
const foodSearchInput  = document.getElementById('foodSearch');
const searchDropdown   = document.getElementById('searchDropdown');
const selectedFoodId   = document.getElementById('selectedFoodId');
const selectedFoodName = document.getElementById('selectedFoodName');
const quantityInput    = document.getElementById('quantityInput');
const addFoodBtn       = document.getElementById('addFoodBtn');
const foodLogWrapper   = document.getElementById('foodLogWrapper');
const foodLogBody      = document.getElementById('foodLogBody');
const foodLogFoot      = document.getElementById('foodLogFoot');
const emptyState       = document.getElementById('emptyState');
const analyseBtn       = document.getElementById('analyseBtn');
const clearBtn         = document.getElementById('clearBtn');
const loadingSection   = document.getElementById('loadingSection');
const errorAlert       = document.getElementById('errorAlert');
const rdiCards         = document.getElementById('rdiCards');
const logDateInput     = document.getElementById('logDate');
const existingBadge    = document.getElementById('existingLogBadge');
const liveBar          = document.getElementById('liveBar');

// ── Date Picker ─────────────────────────────────────────────────
logDateInput.addEventListener('change', async () => {
  selectedDate = logDateInput.value;
  foodLog = [];
  renderFoodLog();
  await checkExistingLog(selectedDate);
});

async function checkExistingLog(dateStr) {
  try {
    const res  = await fetch(`/api/diet_logs/${dateStr}`);
    const data = await res.json();
    if (data.log) {
      existingBadge.classList.remove('d-none');
      // Pre-populate from existing log so user sees what's already saved
      if (data.log.food_entries && data.log.food_entries.length > 0) {
        foodLog = data.log.food_entries;
        renderFoodLog();
        updateLiveBar();
      }
    } else {
      existingBadge.classList.add('d-none');
    }
  } catch { /* silent */ }
}

// ── Food Search Autocomplete ─────────────────────────────────────
foodSearchInput.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  const q = foodSearchInput.value.trim();
  if (q.length < 1) { hideDropdown(); return; }
  searchTimeout = setTimeout(() => fetchFoodSearch(q), 250);
});

async function fetchFoodSearch(query) {
  try {
    const res  = await fetch(`/api/foods/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    renderDropdown(data.foods || []);
  } catch { hideDropdown(); }
}

function renderDropdown(foods) {
  if (!foods.length) {
    searchDropdown.innerHTML = `<div class="dropdown-item-custom" style="color:var(--text-3);font-size:0.85rem;">No results found</div>`;
    searchDropdown.classList.add('show');
    return;
  }
  searchDropdown.innerHTML = foods.map(f => `
    <div class="dropdown-item-custom" data-id="${f.food_id}" data-name="${f.food_name}" data-cat="${f.category}">
      <div>
        <div class="dropdown-food-name">${f.food_name}</div>
        <div class="dropdown-food-meta">${f.category} · per 100g</div>
      </div>
      <div class="dropdown-food-cal">${f.calories} kcal</div>
    </div>
  `).join('');
  searchDropdown.classList.add('show');
  searchDropdown.querySelectorAll('.dropdown-item-custom').forEach(item => {
    item.addEventListener('click', () => {
      selectedFoodId.value    = item.dataset.id;
      selectedFoodName.value  = item.dataset.name;
      foodSearchInput.value   = item.dataset.name;
      hideDropdown();
      quantityInput.focus();
    });
  });
}

function hideDropdown() {
  searchDropdown.classList.remove('show');
  searchDropdown.innerHTML = '';
}

document.addEventListener('click', e => {
  if (!foodSearchInput.contains(e.target) && !searchDropdown.contains(e.target)) {
    hideDropdown();
  }
});

// ── Add Food ─────────────────────────────────────────────────────
addFoodBtn.addEventListener('click', addFood);
quantityInput.addEventListener('keydown', e => { if (e.key === 'Enter') addFood(); });

async function addFood() {
  const id  = selectedFoodId.value;
  const qty = parseFloat(quantityInput.value);

  if (!id)             { showError('Please select a food item from the search results.'); return; }
  if (!qty || qty <= 0){ showError('Please enter a valid quantity in grams.'); return; }

  try {
    addFoodBtn.disabled = true;
    addFoodBtn.innerHTML = `<span class="spinner-border spinner-border-sm"></span>`;

    const res  = await fetch('/api/analyse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ food_entries: [{ food_id: parseInt(id), quantity_g: qty }] })
    });
    const data = await res.json();
    if (data.error) { showError(data.error); return; }

    const item = data.items[0];
    foodLog.push(item);
    renderFoodLog();
    updateLiveBar();
    clearError();

    foodSearchInput.value  = '';
    selectedFoodId.value   = '';
    selectedFoodName.value = '';
    quantityInput.value    = '';
    foodSearchInput.focus();

  } catch { showError('Could not fetch nutritional data. Please try again.'); }
  finally {
    addFoodBtn.disabled = false;
    addFoodBtn.innerHTML = `<i class="bi bi-plus-circle me-2"></i>Add Food`;
  }
}

// ── Render Food Log Table ─────────────────────────────────────────
function renderFoodLog() {
  if (!foodLog.length) {
    foodLogWrapper.classList.add('d-none');
    emptyState.style.display = 'block';
    liveBar.classList.add('d-none');
    return;
  }
  foodLogWrapper.classList.remove('d-none');
  emptyState.style.display = 'none';
  liveBar.classList.remove('d-none');

  foodLogBody.innerHTML = foodLog.map((item, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td><strong>${item.food_name}</strong></td>
      <td><span class="cat-chip cat-${(item.category || '').split(' ')[0]}">${item.category || '—'}</span></td>
      <td>${item.quantity_g}g</td>
      <td>${item.calories} kcal</td>
      <td>${item.protein_g}g</td>
      <td>${item.carbs_g}g</td>
      <td>${item.fat_g}g</td>
      <td>
        <button class="btn-remove" onclick="removeFood(${idx})" title="Remove">
          <i class="bi bi-trash"></i>
        </button>
      </td>
    </tr>
  `).join('');

  const t = computeLocalTotals();
  foodLogFoot.innerHTML = `
    <tr>
      <td colspan="4"><strong>Total</strong></td>
      <td><strong>${t.calories} kcal</strong></td>
      <td><strong>${t.protein_g}g</strong></td>
      <td><strong>${t.carbs_g}g</strong></td>
      <td><strong>${t.fat_g}g</strong></td>
      <td></td>
    </tr>`;
}

function removeFood(idx) {
  foodLog.splice(idx, 1);
  renderFoodLog();
  updateLiveBar();
}

function computeLocalTotals() {
  return {
    calories:  round(foodLog.reduce((s, i) => s + (i.calories  || 0), 0)),
    protein_g: round(foodLog.reduce((s, i) => s + (i.protein_g || 0), 0)),
    carbs_g:   round(foodLog.reduce((s, i) => s + (i.carbs_g   || 0), 0)),
    fat_g:     round(foodLog.reduce((s, i) => s + (i.fat_g     || 0), 0)),
  };
}

// ── Live Nutrition Bar ────────────────────────────────────────────
function updateLiveBar() {
  const t    = computeLocalTotals();
  const tdee = USER_TDEE;

  document.getElementById('lbCal').textContent  = t.calories;
  document.getElementById('lbProt').textContent = t.protein_g + 'g';
  document.getElementById('lbCarb').textContent = t.carbs_g + 'g';
  document.getElementById('lbFat').textContent  = t.fat_g + 'g';

  const calPct = Math.min((t.calories / tdee) * 100, 100);
  document.getElementById('lbCalBar').style.width  = calPct + '%';
  document.getElementById('lbProtBar').style.width = Math.min((t.protein_g / 50)  * 100, 100) + '%';
  document.getElementById('lbCarbBar').style.width = Math.min((t.carbs_g  / 300) * 100, 100) + '%';
  document.getElementById('lbFatBar').style.width  = Math.min((t.fat_g    / 65)  * 100, 100) + '%';

  // Color the calorie bar based on % of TDEE
  const calBarEl = document.getElementById('lbCalBar');
  if (calPct > 95) calBarEl.style.background = 'linear-gradient(90deg,#ef4444,#f43f5e)';
  else if (calPct > 75) calBarEl.style.background = 'linear-gradient(90deg,#f59e0b,#fbbf24)';
  else calBarEl.style.background = 'var(--grad-1)';
}

// ── Clear All ─────────────────────────────────────────────────────
clearBtn.addEventListener('click', () => {
  foodLog = [];
  renderFoodLog();
});

// ── Save & Analyse ────────────────────────────────────────────────
analyseBtn.addEventListener('click', async () => {
  if (!foodLog.length) {
    showError('Please add at least one food item before analysing.');
    return;
  }

  try {
    loadingSection.classList.remove('d-none');
    analyseBtn.disabled = true;
    clearError();

    const entries = foodLog.map(item => ({ food_id: item.food_id, quantity_g: item.quantity_g }));

    // 1. Full analysis
    const analysisRes  = await fetch('/api/analyse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ food_entries: entries }),
    });
    const analysisData = await analysisRes.json();
    if (analysisData.error) { showError(analysisData.error); return; }

    // 2. Save to DB
    const saveRes = await fetch('/api/diet_logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date:         selectedDate,
        food_entries: foodLog,
        totals:       analysisData.totals,
        health_score: analysisData.summary.health_score,
      }),
    });
    const saveData = await saveRes.json();

    // 3. Store results & date in sessionStorage for results page
    sessionStorage.setItem('dietAnalysis', JSON.stringify(analysisData));
    sessionStorage.setItem('logDate',      selectedDate);
    sessionStorage.setItem('saveStatus',   saveData.status || 'created');

    window.location.href = '/results';

  } catch {
    showError('Analysis failed. Please check your connection and try again.');
  } finally {
    loadingSection.classList.add('d-none');
    analyseBtn.disabled = false;
  }
});

// ── RDI Cards ─────────────────────────────────────────────────────
async function loadRDICards() {
  try {
    const res  = await fetch('/api/rdi');
    const data = await res.json();
    rdiCards.innerHTML = Object.entries(data.rdi).map(([key, val]) => `
      <div class="col-6 col-md-4 col-xl-2">
        <div class="rdi-card">
          <div class="rdi-value">${val}</div>
          <div class="rdi-label">${data.labels[key] || key}</div>
        </div>
      </div>
    `).join('');
  } catch { /* non-critical */ }
}

// ── Helpers ───────────────────────────────────────────────────────
function showError(msg) {
  errorAlert.textContent = `⚠ ${msg}`;
  errorAlert.classList.remove('d-none');
  setTimeout(() => clearError(), 5000);
}
function clearError() { errorAlert.classList.add('d-none'); }
function round(n)     { return Math.round(n * 100) / 100; }

// ── Init ───────────────────────────────────────────────────────────
loadRDICards();
renderFoodLog();
checkExistingLog(selectedDate);
