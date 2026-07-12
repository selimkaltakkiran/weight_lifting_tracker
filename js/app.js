// Stack — app shell bootstrap
import { initAuth } from './auth.js';
import { getSessions, addSession, updateSessionExercises, migrateLocalDataIfNeeded, getUserProfile, updateUserProfile } from './data.js';
import { parseWorkoutCsv } from './csv-import.js';
import { getExercises, addExerciseIfNew, syncSeedExercises } from './exercises.js';
import { getWorkouts } from './workouts.js';

// Register service worker for offline/installable support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}

// Tab switching
const viewProfile = document.getElementById('view-profile');
const viewLog = document.getElementById('view-log');
const viewProgress = document.getElementById('view-progress');

document.querySelectorAll('.tab-item').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab-item').forEach((t) => t.classList.remove('is-active'));
    tab.classList.add('is-active');

    const isProfile = tab.dataset.tab === 'profile';
    const isLog = tab.dataset.tab === 'log';
    const isProgress = tab.dataset.tab === 'progress';
    viewProfile.hidden = !isProfile;
    viewLog.hidden = !isLog;
    viewProgress.hidden = !isProgress;
    if (isProfile) {
      viewHome.hidden = true;
      viewSession.hidden = true;
      renderProfile();
    } else if (isLog) {
      viewHome.hidden = true;
      viewSession.hidden = true;
      renderLog();
    } else if (isProgress) {
      viewHome.hidden = true;
      viewSession.hidden = true;
      renderProgress();
    } else if (tab.dataset.tab === 'home') {
      showHome();
    }
  });
});

/* ==========================================================================
   Session tracking
   ========================================================================== */

const viewHome = document.getElementById('view-home');
const viewSession = document.getElementById('view-session');
const emptyState = document.getElementById('empty-state');
const lastSessionEl = document.getElementById('last-session');
const lastSessionDateEl = document.getElementById('last-session-date');
const lastSessionListEl = document.getElementById('last-session-list');
const exerciseListEl = document.getElementById('exercise-list');
const addExerciseForm = document.getElementById('add-exercise-form');
const exerciseNameInput = document.getElementById('exercise-name-input');
const exerciseDatalistEl = document.getElementById('exercise-datalist');
const todaysWorkoutsEl = document.getElementById('todays-workouts');
const todaysWorkoutsListEl = document.getElementById('todays-workouts-list');

async function renderExerciseDatalist() {
  try {
    const names = await getExercises();
    exerciseDatalistEl.innerHTML = names.map((name) => `<option value="${escapeHtml(name)}"></option>`).join('');
  } catch (err) {
    console.warn('renderExerciseDatalist failed:', err);
  }
}

let activeSession = null; // { startedAt, exercises: [{ name, sets: [{ weight, reps }] }] }

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function dateKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function todayDateStr() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

async function renderTodaysWorkouts(todaysExercises) {
  const doneNames = new Set(todaysExercises.map((ex) => ex.name.trim().toLowerCase()));
  const workouts = await getWorkouts();
  const todaysWorkouts = workouts.filter((w) => w.date === todayDateStr());

  if (todaysWorkouts.length === 0) {
    todaysWorkoutsEl.hidden = true;
    return;
  }

  todaysWorkoutsEl.hidden = false;
  todaysWorkoutsListEl.innerHTML = '';

  todaysWorkouts.forEach((workout) => {
    const isDone = doneNames.has(workout.exerciseName.trim().toLowerCase());
    const li = document.createElement('li');
    li.className = `workout-row ${isDone ? 'is-done' : 'is-pending'}`;
    li.innerHTML = `
      <span class="workout-row-info">
        <span class="exercise-name">${escapeHtml(workout.exerciseName)}</span>
        <span class="exercise-meta">${workout.weight}kg × ${workout.reps} reps</span>
      </span>
      <button type="button" class="workout-start-btn">Start session</button>
    `;
    li.querySelector('.workout-start-btn').addEventListener('click', () => startWorkoutSession(workout.exerciseName));
    todaysWorkoutsListEl.appendChild(li);
  });
}

function startWorkoutSession(exerciseName) {
  if (!activeSession) {
    activeSession = { startedAt: new Date().toISOString(), exercises: [] };
  }
  const alreadyAdded = activeSession.exercises.some(
    (ex) => ex.name.trim().toLowerCase() === exerciseName.trim().toLowerCase()
  );
  if (!alreadyAdded) {
    activeSession.exercises.push({ name: exerciseName, sets: [] });
  }
  showSession();
}

async function renderHome() {
  const sessions = await getSessions();
  const todayKey = dateKey(new Date().toISOString());
  const todaysExercises = sessions
    .filter((s) => dateKey(s.startedAt) === todayKey)
    .flatMap((s) => s.exercises);

  renderTodaysWorkouts(todaysExercises).catch((err) => console.warn('renderTodaysWorkouts failed:', err));

  if (todaysExercises.length === 0) {
    emptyState.hidden = false;
    lastSessionEl.hidden = true;
    return;
  }

  emptyState.hidden = true;
  lastSessionEl.hidden = false;
  lastSessionDateEl.textContent = formatDate(new Date().toISOString());
  lastSessionListEl.innerHTML = '';

  todaysExercises.forEach((ex) => {
    const li = document.createElement('li');
    const topSet = ex.sets.reduce((best, s) => (s.weight > best.weight ? s : best), ex.sets[0]);
    li.innerHTML = `
      <span class="exercise-name">${escapeHtml(ex.name)}</span>
      <span class="exercise-meta">${ex.sets.length} sets · top ${topSet.weight}kg × ${topSet.reps}</span>
    `;
    lastSessionListEl.appendChild(li);
  });
}

const logEmptyState = document.getElementById('log-empty-state');
const logTableWrap = document.getElementById('log-table-wrap');
const logTableBodyEl = document.getElementById('log-table-body');
const logCalendarView = document.getElementById('log-calendar-view');
const logDayView = document.getElementById('log-day-view');
const calendarMonthLabelEl = document.getElementById('calendar-month-label');
const calendarGridEl = document.getElementById('calendar-grid');
const logDayDateEl = document.getElementById('log-day-date');

let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

function sessionRows(sessions) {
  const rows = [];
  sessions.forEach((session) => {
    session.exercises.forEach((ex, exIndex) => {
      if (ex.sets.length === 0) return;
      const total = ex.sets.reduce((sum, s) => sum + s.weight * s.reps, 0);
      rows.push({
        date: session.startedAt,
        sessionId: session.id,
        exIndex,
        name: ex.name,
        weight: ex.sets[0].weight,
        reps: ex.sets[0].reps,
        sets: ex.sets.length,
        total,
        avgSetVol: total / ex.sets.length,
        notes: ex.notes || '',
      });
    });
  });
  rows.sort((a, b) => new Date(a.date) - new Date(b.date));
  return rows;
}

async function deleteExerciseRow(sessionId, exIndex) {
  const sessions = await getSessions();
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) return;
  const exercises = session.exercises.filter((_, i) => i !== exIndex);
  await updateSessionExercises(sessionId, exercises);
}

async function renderLog() {
  logDayView.hidden = true;
  logCalendarView.hidden = false;
  await renderCalendar();
}

async function renderCalendar() {
  const sessions = await getSessions();
  const daysWithSessions = new Set(sessions.map((s) => dateKey(s.startedAt)));

  calendarMonthLabelEl.textContent = calendarMonth.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay();
  const gridStart = new Date(year, month, 1 - startOffset);
  const today = new Date();
  const todayKey = dateKey(today.toISOString());

  calendarGridEl.innerHTML = '';

  for (let i = 0; i < 42; i++) {
    const cellDate = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    const isOutside = cellDate.getMonth() !== month;
    const key = `${cellDate.getFullYear()}-${cellDate.getMonth()}-${cellDate.getDate()}`;

    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'calendar-day';
    if (isOutside) cell.classList.add('is-outside');
    if (key === todayKey) cell.classList.add('is-today');
    if (daysWithSessions.has(key)) cell.classList.add('has-sessions');
    cell.textContent = cellDate.getDate();
    cell.addEventListener('click', () => showDayView(cellDate));
    calendarGridEl.appendChild(cell);
  }
}

async function showDayView(date) {
  logCalendarView.hidden = true;
  logDayView.hidden = false;
  logDayDateEl.textContent = formatDate(date.toISOString());

  const sessions = await getSessions();
  const key = dateKey(date.toISOString());
  const rows = sessionRows(sessions).filter((row) => dateKey(row.date) === key);

  if (rows.length === 0) {
    logEmptyState.hidden = false;
    logTableWrap.hidden = true;
    return;
  }

  logEmptyState.hidden = true;
  logTableWrap.hidden = false;
  logTableBodyEl.innerHTML = '';

  rows.forEach((row) => {
    const tr = document.createElement('tr');
    tr.className = 'log-row';
    tr.innerHTML = `
      <td>${escapeHtml(row.name)}</td>
      <td>${row.weight}</td>
      <td>${row.reps}</td>
      <td>${row.sets}</td>
      <td>${row.total}</td>
      <td>${Math.round(row.avgSetVol * 100) / 100}</td>
      <td>${escapeHtml(row.notes)}</td>
    `;

    const actionsTr = document.createElement('tr');
    actionsTr.className = 'log-actions-row';
    actionsTr.hidden = true;
    actionsTr.innerHTML = `
      <td colspan="7">
        <div class="log-row-actions">
          <button type="button" class="log-action-btn log-edit-btn">Edit</button>
          <button type="button" class="log-action-btn log-delete-btn">Delete</button>
        </div>
      </td>
    `;

    tr.addEventListener('click', () => {
      const wasHidden = actionsTr.hidden;
      logTableBodyEl.querySelectorAll('.log-actions-row').forEach((el) => {
        el.hidden = true;
      });
      logTableBodyEl.querySelectorAll('.log-row').forEach((el) => {
        el.classList.remove('is-expanded');
      });
      actionsTr.hidden = !wasHidden;
      tr.classList.toggle('is-expanded', !wasHidden);
    });

    actionsTr.querySelector('.log-delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      openDeleteExerciseModal(row, date);
    });

    logTableBodyEl.appendChild(tr);
    logTableBodyEl.appendChild(actionsTr);
  });
}

const progressEmptyState = document.getElementById('progress-empty-state');
const progressTableWrap = document.getElementById('progress-table-wrap');
const progressTableBodyEl = document.getElementById('progress-table-body');
const progressListView = document.getElementById('progress-list-view');
const progressDetailView = document.getElementById('progress-detail-view');
const progressDetailTitleEl = document.getElementById('progress-detail-title');
const progressDetailEmptyEl = document.getElementById('progress-detail-empty');
const progressChartWrapEl = document.getElementById('progress-chart-wrap');
const progressMonthLabelEl = document.getElementById('progress-month-label');
const progressDetailMonthLabelEl = document.getElementById('progress-detail-month-label');

let progressMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let currentDetailExercise = null;
let currentDetailMetric = 'volume';

const PROGRESS_METRICS = {
  volume: { label: 'Volume', unit: 'kg', valueFor: (s) => s.weight * s.reps },
  reps: { label: 'Avg. Reps', unit: ' reps', valueFor: (s) => s.reps },
};

function progressMonthLabel(monthDate) {
  return monthDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

async function renderProgress() {
  progressDetailView.hidden = true;
  progressListView.hidden = false;
  progressMonthLabelEl.textContent = progressMonthLabel(progressMonth);

  const sessions = await getSessions();
  const monthKey = `${progressMonth.getFullYear()}-${progressMonth.getMonth()}`;

  const stats = new Map(); // name -> { volume, reps, sessions }

  sessions.forEach((session) => {
    const d = new Date(session.startedAt);
    if (`${d.getFullYear()}-${d.getMonth()}` !== monthKey) return;

    session.exercises.forEach((ex) => {
      if (ex.sets.length === 0) return;
      if (!stats.has(ex.name)) stats.set(ex.name, { volume: 0, reps: 0, sessions: 0 });
      const entry = stats.get(ex.name);
      entry.sessions += 1;
      ex.sets.forEach((s) => {
        entry.volume += s.weight * s.reps;
        entry.reps += s.reps;
      });
    });
  });

  const names = Array.from(stats.keys()).sort((a, b) => a.localeCompare(b));

  if (names.length === 0) {
    progressEmptyState.hidden = false;
    progressTableWrap.hidden = true;
    return;
  }

  progressEmptyState.hidden = true;
  progressTableWrap.hidden = false;
  progressTableBodyEl.innerHTML = '';

  names.forEach((name) => {
    const { volume, reps, sessions: sessionCount } = stats.get(name);
    const avgReps = reps / sessionCount;
    const tr = document.createElement('tr');
    tr.className = 'progress-row';
    tr.innerHTML = `
      <td>${escapeHtml(name)}</td>
      <td class="metric-clickable" data-metric="volume">${Math.round(volume * 100) / 100}kg</td>
      <td class="metric-clickable" data-metric="reps">${Math.round(avgReps * 10) / 10}</td>
    `;
    tr.querySelector('[data-metric="volume"]').addEventListener('click', () => showProgressDetail(name, 'volume'));
    tr.querySelector('[data-metric="reps"]').addEventListener('click', () => showProgressDetail(name, 'reps'));
    progressTableBodyEl.appendChild(tr);
  });
}

function showProgressDetail(name, metric) {
  currentDetailExercise = name;
  currentDetailMetric = metric;
  progressListView.hidden = true;
  progressDetailView.hidden = false;
  progressDetailTitleEl.textContent = `${name} — ${PROGRESS_METRICS[metric].label}`;
  renderProgressDetail(name, metric);
}

async function renderProgressDetail(name, metric = currentDetailMetric) {
  const metricConfig = PROGRESS_METRICS[metric];
  progressDetailMonthLabelEl.textContent = progressMonthLabel(progressMonth);

  const sessions = await getSessions();
  const monthKey = `${progressMonth.getFullYear()}-${progressMonth.getMonth()}`;

  const dayValues = new Map(); // dateKey -> { day, value }

  sessions.forEach((session) => {
    const d = new Date(session.startedAt);
    if (`${d.getFullYear()}-${d.getMonth()}` !== monthKey) return;

    session.exercises.forEach((ex) => {
      if (ex.name !== name || ex.sets.length === 0) return;
      const key = dateKey(session.startedAt);
      if (!dayValues.has(key)) dayValues.set(key, { day: d.getDate(), value: 0 });
      const entry = dayValues.get(key);
      ex.sets.forEach((s) => {
        entry.value += metricConfig.valueFor(s);
      });
    });
  });

  const points = Array.from(dayValues.values()).sort((a, b) => a.day - b.day);

  if (points.length < 2) {
    progressDetailEmptyEl.hidden = false;
    progressChartWrapEl.hidden = true;
    return;
  }

  progressDetailEmptyEl.hidden = true;
  progressChartWrapEl.hidden = false;

  progressChartWrapEl.innerHTML = `
    <div class="progress-chart-canvas">
      ${buildMetricChartSvg(points, metricConfig)}
      <div class="progress-chart-tooltip" id="progress-chart-tooltip" hidden></div>
    </div>
  `;

  attachChartTooltips(progressChartWrapEl, metricConfig);
}

function buildMetricChartSvg(points, metricConfig) {
  const width = 600;
  const height = 260;
  const padding = { top: 16, right: 16, bottom: 40, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const maxValue = Math.max(...points.map((p) => p.value));
  const minValue = 0;

  const xFor = (i) => padding.left + (points.length === 1 ? chartW / 2 : (i / (points.length - 1)) * chartW);
  const yFor = (v) => padding.top + chartH - ((v - minValue) / (maxValue - minValue || 1)) * chartH;

  const coords = points.map((p, i) => ({ x: xFor(i), y: yFor(p.value), ...p }));

  const linePoints = coords.map((c) => `${c.x},${c.y}`).join(' ');

  const gridSteps = [0, 0.25, 0.5, 0.75, 1];
  const gridLines = gridSteps
    .map((t) => padding.top + chartH * (1 - t))
    .map((y) => `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="var(--border)" stroke-width="1" />`)
    .join('');

  const yTickLabels = gridSteps
    .map((t) => ({ y: padding.top + chartH * (1 - t), value: maxValue * t }))
    .map((tick) => `<text x="${padding.left - 8}" y="${tick.y + 3}" text-anchor="end" class="chart-label">${Math.round(tick.value)}</text>`)
    .join('');

  const showEveryLabel = points.length <= 15;
  const dayLabels = coords
    .filter((c, i) => showEveryLabel || i % 2 === 0)
    .map((c) => `<text x="${c.x}" y="${height - padding.bottom + 16}" text-anchor="middle" class="chart-label">${c.day}</text>`)
    .join('');

  const dots = coords
    .map(
      (c) =>
        `<circle class="chart-dot" cx="${c.x}" cy="${c.y}" r="4" fill="var(--accent)" data-day="${c.day}" data-value="${Math.round(c.value * 100) / 100}"></circle>`
    )
    .join('');

  const axisTitleY = `<text x="14" y="${padding.top + chartH / 2}" text-anchor="middle" class="chart-axis-title" transform="rotate(-90 14 ${padding.top + chartH / 2})">${metricConfig.label} (${metricConfig.unit.trim()})</text>`;
  const axisTitleX = `<text x="${padding.left + chartW / 2}" y="${height - 6}" text-anchor="middle" class="chart-axis-title">Day of month</text>`;

  return `
    <svg viewBox="0 0 ${width} ${height}" class="progress-chart-svg" preserveAspectRatio="none">
      ${gridLines}
      ${yTickLabels}
      <polyline points="${linePoints}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      ${dots}
      ${dayLabels}
      ${axisTitleY}
      ${axisTitleX}
    </svg>
  `;
}

function attachChartTooltips(container, metricConfig) {
  const tooltip = container.querySelector('#progress-chart-tooltip');
  const canvas = container.querySelector('.progress-chart-canvas');
  if (!tooltip || !canvas) return;

  const showTooltip = (dot, e) => {
    const rect = canvas.getBoundingClientRect();
    tooltip.hidden = false;
    tooltip.textContent = `Day ${dot.dataset.day}: ${dot.dataset.value}${metricConfig.unit}`;
    tooltip.style.left = `${e.clientX - rect.left}px`;
    tooltip.style.top = `${e.clientY - rect.top}px`;
  };

  container.querySelectorAll('.chart-dot').forEach((dot) => {
    dot.addEventListener('mouseenter', (e) => showTooltip(dot, e));
    dot.addEventListener('mousemove', (e) => showTooltip(dot, e));
    dot.addEventListener('mouseleave', () => {
      tooltip.hidden = true;
    });
  });
}

document.getElementById('btn-progress-back').addEventListener('click', () => {
  progressDetailView.hidden = true;
  progressListView.hidden = false;
});

function shiftProgressMonth(delta) {
  progressMonth = new Date(progressMonth.getFullYear(), progressMonth.getMonth() + delta, 1);
}

document.getElementById('btn-progress-prev').addEventListener('click', () => {
  shiftProgressMonth(-1);
  renderProgress();
});

document.getElementById('btn-progress-next').addEventListener('click', () => {
  shiftProgressMonth(1);
  renderProgress();
});

document.getElementById('btn-progress-detail-prev').addEventListener('click', () => {
  shiftProgressMonth(-1);
  renderProgressDetail(currentDetailExercise);
});

document.getElementById('btn-progress-detail-next').addEventListener('click', () => {
  shiftProgressMonth(1);
  renderProgressDetail(currentDetailExercise);
});

const deleteModal = document.getElementById('confirm-delete-modal');
const deleteModalText = document.getElementById('confirm-delete-text');
const deleteModalConfirmBtn = document.getElementById('confirm-delete-btn');
const deleteModalCancelBtn = document.getElementById('cancel-delete-btn');
let pendingDelete = null;

function openDeleteExerciseModal(row, date) {
  pendingDelete = { sessionId: row.sessionId, exIndex: row.exIndex, date };
  deleteModalText.textContent = `Delete "${row.name}" from this session? This can't be undone.`;
  deleteModal.hidden = false;
}

function closeDeleteExerciseModal() {
  deleteModal.hidden = true;
  pendingDelete = null;
}

deleteModalCancelBtn.addEventListener('click', closeDeleteExerciseModal);
deleteModal.addEventListener('click', (e) => {
  if (e.target === deleteModal) closeDeleteExerciseModal();
});

deleteModalConfirmBtn.addEventListener('click', async () => {
  if (!pendingDelete) return;
  const { sessionId, exIndex, date } = pendingDelete;
  await deleteExerciseRow(sessionId, exIndex);
  closeDeleteExerciseModal();
  await showDayView(date);
  await renderCalendar();
});

document.getElementById('btn-day-back').addEventListener('click', () => {
  logDayView.hidden = true;
  logCalendarView.hidden = false;
});

document.getElementById('btn-cal-prev').addEventListener('click', () => {
  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
  renderCalendar();
});

document.getElementById('btn-cal-next').addEventListener('click', () => {
  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
  renderCalendar();
});

function showHome() {
  viewHome.hidden = false;
  viewSession.hidden = true;
  renderHome();
}

function showSession() {
  viewHome.hidden = true;
  viewSession.hidden = false;
  renderExerciseList();
  renderExerciseDatalist();
}

function startSession() {
  activeSession = { startedAt: new Date().toISOString(), exercises: [] };
  showSession();
}

function cancelSession() {
  if (activeSession.exercises.length > 0) {
    const ok = confirm('Discard this session? Logged sets will be lost.');
    if (!ok) return;
  }
  activeSession = null;
  showHome();
}

async function finishSession() {
  const exercisesWithSets = activeSession.exercises.filter((ex) => ex.sets.length > 0);
  if (exercisesWithSets.length === 0) {
    const ok = confirm('No sets logged. Discard this session?');
    if (ok) {
      activeSession = null;
      showHome();
    }
    return;
  }
  await addSession({ ...activeSession, exercises: exercisesWithSets, endedAt: new Date().toISOString() });
  activeSession = null;
  showHome();
}

function renderExerciseList() {
  exerciseListEl.innerHTML = '';

  activeSession.exercises.forEach((ex, exIndex) => {
    const card = document.createElement('div');
    card.className = 'exercise-card';

    const header = document.createElement('div');
    header.className = 'exercise-card-header';
    header.innerHTML = `
      <span class="exercise-card-name">${escapeHtml(ex.name)}</span>
      <button type="button" class="remove-exercise-btn">Remove</button>
    `;
    header.querySelector('.remove-exercise-btn').addEventListener('click', () => {
      activeSession.exercises.splice(exIndex, 1);
      renderExerciseList();
    });
    card.appendChild(header);

    ex.sets.forEach((set, setIndex) => {
      const row = document.createElement('div');
      row.className = 'set-row';
      row.innerHTML = `
        <span class="set-index">${setIndex + 1}</span>
        <span class="set-summary">${set.weight}kg × ${set.reps} reps</span>
        <button type="button" class="remove-set-btn">Remove</button>
      `;
      row.querySelector('.remove-set-btn').addEventListener('click', () => {
        ex.sets.splice(setIndex, 1);
        renderExerciseList();
      });
      card.appendChild(row);
    });

    const setForm = document.createElement('form');
    setForm.className = 'add-set-form';
    setForm.innerHTML = `
      <input type="number" step="0.5" min="0" placeholder="kg" inputmode="decimal" required />
      <input type="number" step="1" min="0" placeholder="reps" inputmode="numeric" required />
      <button type="submit">Add set</button>
    `;
    setForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const [weightInput, repsInput] = setForm.querySelectorAll('input');
      const weight = parseFloat(weightInput.value);
      const reps = parseInt(repsInput.value, 10);
      if (!Number.isFinite(weight) || !Number.isFinite(reps)) return;
      ex.sets.push({ weight, reps });
      renderExerciseList();
    });
    card.appendChild(setForm);

    exerciseListEl.appendChild(card);
  });
}

document.getElementById('btn-start-session').addEventListener('click', startSession);
document.getElementById('btn-new-session').addEventListener('click', startSession);
document.getElementById('btn-cancel-session').addEventListener('click', cancelSession);
document.getElementById('btn-finish-session').addEventListener('click', finishSession);

addExerciseForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = exerciseNameInput.value.trim();
  if (!name) return;
  activeSession.exercises.push({ name, sets: [] });
  exerciseNameInput.value = '';
  renderExerciseList();
  addExerciseIfNew(name)
    .catch((err) => console.warn('addExerciseIfNew failed:', err))
    .then(renderExerciseDatalist);
});

/* ==========================================================================
   CSV import
   ========================================================================== */

const btnImportCsv = document.getElementById('btn-import-csv');
const csvImportInput = document.getElementById('csv-import-input');
const importStatusEl = document.getElementById('import-status');

btnImportCsv.addEventListener('click', () => csvImportInput.click());

function exerciseSignature(dateIso, ex) {
  const setsCount = ex.sets.length;
  const weight = setsCount > 0 ? ex.sets[0].weight : 0;
  const reps = setsCount > 0 ? ex.sets[0].reps : 0;
  return `${dateKey(dateIso)}|${ex.name.trim().toLowerCase()}|${weight}|${reps}|${setsCount}`;
}

csvImportInput.addEventListener('change', async () => {
  const file = csvImportInput.files[0];
  if (!file) return;

  const text = await file.text();
  const { sessions: parsedSessions, errors } = parseWorkoutCsv(text);

  const existingSessions = await getSessions();
  const seenSignatures = new Set();
  existingSessions.forEach((session) => {
    session.exercises.forEach((ex) => seenSignatures.add(exerciseSignature(session.startedAt, ex)));
  });

  let duplicateCount = 0;
  const sessions = [];
  parsedSessions.forEach((session) => {
    const newExercises = session.exercises.filter((ex) => {
      const sig = exerciseSignature(session.startedAt, ex);
      if (seenSignatures.has(sig)) {
        duplicateCount++;
        return false;
      }
      seenSignatures.add(sig);
      return true;
    });
    if (newExercises.length > 0) {
      sessions.push({ ...session, exercises: newExercises });
    }
  });

  for (const session of sessions) {
    await addSession(session);
  }

  const exerciseCount = sessions.reduce((sum, s) => sum + s.exercises.length, 0);
  const parts = [];
  if (sessions.length > 0) {
    parts.push(`Imported ${sessions.length} session${sessions.length === 1 ? '' : 's'} (${exerciseCount} exercise${exerciseCount === 1 ? '' : 's'}).`);
  }
  if (duplicateCount > 0) {
    parts.push(`${duplicateCount} duplicate row${duplicateCount === 1 ? '' : 's'} skipped.`);
  }
  if (errors.length > 0) {
    parts.push(`${errors.length} row${errors.length === 1 ? '' : 's'} skipped: ${errors.join(' ')}`);
  }
  if (parts.length === 0) {
    parts.push('No rows found in CSV.');
  }

  importStatusEl.textContent = parts.join(' ');
  importStatusEl.classList.toggle('is-error', errors.length > 0);
  importStatusEl.hidden = false;

  csvImportInput.value = '';

  if (!viewLog.hidden) renderCalendar();
  if (!viewHome.hidden) renderHome();
});

/* ==========================================================================
   Profile
   ========================================================================== */

const profileGenderEl = document.getElementById('profile-gender');
const profileAgeEl = document.getElementById('profile-age');
const profileHeightEl = document.getElementById('profile-height');
const profileWeightEl = document.getElementById('profile-weight');
const btnEditProfile = document.getElementById('btn-edit-profile');
const editProfileModal = document.getElementById('edit-profile-modal');
const editProfileForm = document.getElementById('edit-profile-form');
const cancelEditProfileBtn = document.getElementById('cancel-edit-profile-btn');
const profileInputGender = document.getElementById('profile-input-gender');
const profileInputAge = document.getElementById('profile-input-age');
const profileInputHeight = document.getElementById('profile-input-height');
const profileInputWeight = document.getElementById('profile-input-weight');

const GENDER_LABELS = { male: 'Male', female: 'Female', other: 'Other' };

const workoutsListEl = document.getElementById('workouts-list');
const workoutsEmptyStateEl = document.getElementById('workouts-empty-state');

function formatWorkoutDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

async function renderWorkoutsList() {
  const workouts = await getWorkouts();

  if (workouts.length === 0) {
    workoutsEmptyStateEl.hidden = false;
    workoutsListEl.innerHTML = '';
    return;
  }

  workoutsEmptyStateEl.hidden = true;
  workoutsListEl.innerHTML = '';

  workouts
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((workout) => {
      const li = document.createElement('li');
      li.className = 'workout-row';
      li.innerHTML = `
        <span class="workout-row-info">
          <span class="exercise-name">${escapeHtml(workout.exerciseName)}</span>
          <span class="exercise-meta">${formatWorkoutDate(workout.date)} · ${workout.weight}kg × ${workout.reps} reps</span>
        </span>
      `;
      workoutsListEl.appendChild(li);
    });
}

async function renderProfile() {
  const profile = await getUserProfile();
  profileGenderEl.textContent = GENDER_LABELS[profile.gender] || '—';
  profileAgeEl.textContent = profile.age != null ? profile.age : '—';
  profileHeightEl.textContent = profile.height != null ? `${profile.height} cm` : '—';
  profileWeightEl.textContent = profile.weight != null ? `${profile.weight} kg` : '—';
  renderWorkoutsList().catch((err) => console.warn('renderWorkoutsList failed:', err));
}

async function openEditProfileModal() {
  const profile = await getUserProfile();
  profileInputGender.value = profile.gender || '';
  profileInputAge.value = profile.age ?? '';
  profileInputHeight.value = profile.height ?? '';
  profileInputWeight.value = profile.weight ?? '';
  editProfileModal.hidden = false;
}

function closeEditProfileModal() {
  editProfileModal.hidden = true;
}

btnEditProfile.addEventListener('click', openEditProfileModal);
cancelEditProfileBtn.addEventListener('click', closeEditProfileModal);
editProfileModal.addEventListener('click', (e) => {
  if (e.target === editProfileModal) closeEditProfileModal();
});

editProfileForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const profile = {
    gender: profileInputGender.value,
    age: profileInputAge.value ? parseInt(profileInputAge.value, 10) : null,
    height: profileInputHeight.value ? parseFloat(profileInputHeight.value) : null,
    weight: profileInputWeight.value ? parseFloat(profileInputWeight.value) : null,
  };
  await updateUserProfile(profile);
  closeEditProfileModal();
  renderProfile();
});

initAuth(
  async () => {
    await migrateLocalDataIfNeeded();
    showHome();
    syncSeedExercises().catch((err) => console.warn('syncSeedExercises failed:', err));
  },
  () => {
    // Signed out — auth gate is shown by auth.js
    syncSeedExercises().catch((err) => console.warn('syncSeedExercises failed:', err));
  }
);
