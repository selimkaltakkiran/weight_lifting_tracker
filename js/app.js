// Stack — app shell bootstrap

// Register service worker for offline/installable support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}

// Tab switching (visual only — routes come later)
document.querySelectorAll('.tab-item').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab-item').forEach((t) => t.classList.remove('is-active'));
    tab.classList.add('is-active');
  });
});

/* ==========================================================================
   Session tracking
   ========================================================================== */

const STORAGE_KEY = 'stack.sessions';

const viewHome = document.getElementById('view-home');
const viewSession = document.getElementById('view-session');
const emptyState = document.getElementById('empty-state');
const lastSessionEl = document.getElementById('last-session');
const lastSessionDateEl = document.getElementById('last-session-date');
const lastSessionListEl = document.getElementById('last-session-list');
const exerciseListEl = document.getElementById('exercise-list');
const addExerciseForm = document.getElementById('add-exercise-form');
const exerciseNameInput = document.getElementById('exercise-name-input');

let activeSession = null; // { startedAt, exercises: [{ name, sets: [{ weight, reps }] }] }

function getSessions() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveSessions(sessions) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

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

function renderHome() {
  const sessions = getSessions();
  const last = sessions[sessions.length - 1];

  if (!last) {
    emptyState.hidden = false;
    lastSessionEl.hidden = true;
    return;
  }

  emptyState.hidden = true;
  lastSessionEl.hidden = false;
  lastSessionDateEl.textContent = formatDate(last.startedAt);
  lastSessionListEl.innerHTML = '';

  last.exercises.forEach((ex) => {
    const li = document.createElement('li');
    const topSet = ex.sets.reduce((best, s) => (s.weight > best.weight ? s : best), ex.sets[0]);
    li.innerHTML = `
      <span class="exercise-name">${escapeHtml(ex.name)}</span>
      <span class="exercise-meta">${ex.sets.length} sets · top ${topSet.weight}kg × ${topSet.reps}</span>
    `;
    lastSessionListEl.appendChild(li);
  });
}

function showHome() {
  viewHome.hidden = false;
  viewSession.hidden = true;
  renderHome();
}

function showSession() {
  viewHome.hidden = true;
  viewSession.hidden = false;
  renderExerciseList();
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

function finishSession() {
  const exercisesWithSets = activeSession.exercises.filter((ex) => ex.sets.length > 0);
  if (exercisesWithSets.length === 0) {
    const ok = confirm('No sets logged. Discard this session?');
    if (ok) {
      activeSession = null;
      showHome();
    }
    return;
  }
  const sessions = getSessions();
  sessions.push({ ...activeSession, exercises: exercisesWithSets, endedAt: new Date().toISOString() });
  saveSessions(sessions);
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
});

showHome();
