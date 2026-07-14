// Stack — planned workout storage (per-user), Firestore-backed with localStorage as an offline cache.
// Read-only when signed out; a trainer with granted access can create/edit/delete a client's workouts.
import { db } from './firebase-config.js';
import { currentUser } from './auth.js';
import {
  collection,
  addDoc,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const STORAGE_KEY = 'stack.workouts';

function readLocalWorkouts() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

export async function getWorkouts(uid = currentUser?.uid) {
  if (!uid) return readLocalWorkouts();

  const workoutsRef = collection(db, 'users', uid, 'workouts');
  const snapshot = await getDocs(workoutsRef);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addWorkout(uid, workout) {
  const workoutsRef = collection(db, 'users', uid, 'workouts');
  const docRef = await addDoc(workoutsRef, workout);
  return { id: docRef.id, ...workout };
}

export async function updateWorkout(uid, workoutId, workout) {
  const workoutRef = doc(db, 'users', uid, 'workouts', workoutId);
  await setDoc(workoutRef, workout, { merge: true });
}

export async function deleteWorkout(uid, workoutId) {
  const workoutRef = doc(db, 'users', uid, 'workouts', workoutId);
  await deleteDoc(workoutRef);
}
