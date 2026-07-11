// Stack — exercise name database (for autocomplete), Firestore-backed per-user with localStorage as an offline cache
import { db } from './firebase-config.js';
import { currentUser } from './auth.js';
import { SEED_EXERCISES } from './exercise-seed-data.js';
import {
  collection,
  getDocs,
  doc,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const STORAGE_KEY = 'stack.exercises';

function normalize(name) {
  return name.trim();
}

function docIdFor(name) {
  return normalize(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function readLocalExercises() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function writeLocalExercises(names) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(names));
}

export async function getExercises() {
  let names;
  if (!currentUser) {
    names = readLocalExercises();
  } else {
    const exercisesRef = collection(db, 'users', currentUser.uid, 'exercises');
    const snapshot = await getDocs(exercisesRef);
    names = snapshot.docs.map((d) => d.data().name);
    writeLocalExercises(names);
  }
  return names.slice().sort((a, b) => a.localeCompare(b));
}

export async function addExerciseIfNew(name) {
  const normalized = normalize(name);
  if (!normalized) return;

  if (!currentUser) {
    const names = readLocalExercises();
    if (names.some((n) => n.toLowerCase() === normalized.toLowerCase())) return;
    names.push(normalized);
    writeLocalExercises(names);
    return;
  }

  const exercisesRef = collection(db, 'users', currentUser.uid, 'exercises');
  const snapshot = await getDocs(exercisesRef);
  const names = snapshot.docs.map((d) => d.data().name);
  if (names.some((n) => n.toLowerCase() === normalized.toLowerCase())) return;

  const exerciseRef = doc(db, 'users', currentUser.uid, 'exercises', docIdFor(normalized));
  await setDoc(exerciseRef, { name: normalized });
}

export async function syncSeedExercises() {
  if (!currentUser) {
    const names = readLocalExercises();
    const existing = new Set(names.map((n) => n.toLowerCase()));
    const missing = SEED_EXERCISES.filter((n) => !existing.has(n.toLowerCase()));
    if (missing.length > 0) {
      writeLocalExercises([...names, ...missing]);
    }
    return;
  }

  const exercisesRef = collection(db, 'users', currentUser.uid, 'exercises');
  const snapshot = await getDocs(exercisesRef);
  const existing = new Set(snapshot.docs.map((d) => d.data().name.toLowerCase()));
  const missing = SEED_EXERCISES.filter((n) => !existing.has(n.toLowerCase()));

  await Promise.all(
    missing.map((name) => setDoc(doc(db, 'users', currentUser.uid, 'exercises', docIdFor(name)), { name }))
  );
}
