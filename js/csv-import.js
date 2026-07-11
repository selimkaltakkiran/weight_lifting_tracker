// Stack — CSV import parsing (pure, no DOM/Firestore dependencies)

function parseCsvLine(line) {
  const cells = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cells.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

function parseCsvText(text) {
  return text
    .split(/\r\n|\r|\n/)
    .filter((line) => line.trim().length > 0)
    .map(parseCsvLine);
}

function parseDate(str) {
  const parts = str.split('/');
  if (parts.length !== 3) return null;
  const [m, d, y] = parts.map((p) => parseInt(p, 10));
  if (!Number.isFinite(m) || !Number.isFinite(d) || !Number.isFinite(y)) return null;
  const date = new Date(y, m - 1, d, 12, 0, 0);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

export function parseWorkoutCsv(text) {
  const rows = parseCsvText(text);
  const errors = [];

  if (rows.length === 0) {
    return { sessions: [], errors: ['CSV file is empty.'] };
  }

  const header = rows[0].map((h) => h.toLowerCase());
  const colIndex = {
    date: header.indexOf('date'),
    name: header.indexOf('name'),
    weight: header.indexOf('weight'),
    reps: header.indexOf('reps'),
    sets: header.indexOf('sets'),
    notes: header.indexOf('notes'),
  };

  const required = ['date', 'name', 'weight', 'reps', 'sets'];
  const missing = required.filter((key) => colIndex[key] === -1);
  if (missing.length > 0) {
    return { sessions: [], errors: [`Missing required column(s): ${missing.join(', ')}`] };
  }

  const sessionsByDateKey = new Map();

  for (let i = 1; i < rows.length; i++) {
    const rowNum = i + 1;
    const cells = rows[i];

    const dateStr = cells[colIndex.date] || '';
    const name = (cells[colIndex.name] || '').trim();
    const weight = parseFloat(cells[colIndex.weight]);
    const reps = parseInt(cells[colIndex.reps], 10);
    const setsCount = parseInt(cells[colIndex.sets], 10);
    const notes = colIndex.notes !== -1 ? (cells[colIndex.notes] || '').trim() : '';

    const date = parseDate(dateStr);
    if (!date) {
      errors.push(`Row ${rowNum}: invalid date "${dateStr}".`);
      continue;
    }
    if (!name) {
      errors.push(`Row ${rowNum}: missing exercise name.`);
      continue;
    }
    if (!Number.isFinite(weight) || weight < 0) {
      errors.push(`Row ${rowNum}: invalid weight.`);
      continue;
    }
    if (!Number.isFinite(reps) || reps <= 0) {
      errors.push(`Row ${rowNum}: invalid reps.`);
      continue;
    }
    if (!Number.isFinite(setsCount) || setsCount <= 0) {
      errors.push(`Row ${rowNum}: invalid sets.`);
      continue;
    }

    const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    if (!sessionsByDateKey.has(dateKey)) {
      sessionsByDateKey.set(dateKey, {
        startedAt: date.toISOString(),
        endedAt: date.toISOString(),
        exercises: [],
      });
    }

    sessionsByDateKey.get(dateKey).exercises.push({
      name,
      sets: Array.from({ length: setsCount }, () => ({ weight, reps })),
      notes,
    });
  }

  const sessions = Array.from(sessionsByDateKey.values()).sort(
    (a, b) => new Date(a.startedAt) - new Date(b.startedAt)
  );

  return { sessions, errors };
}
