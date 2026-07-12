// Stack — planned workout storage (per-user), Firestore-backed with localStorage as an offline cache.
// Read-only for now: workouts are seeded externally (e.g. by a trainer later); the app only reads them.
import { db } from './firebase-config.js';
import { currentUser } from './auth.js';
import {
  collection,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const STORAGE_KEY = 'stack.workouts';

function readLocalWorkouts() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

export async function getWorkouts() {
  if (!currentUser) return readLocalWorkouts();

  const workoutsRef = collection(db, 'users', currentUser.uid, 'workouts');
  const snapshot = await getDocs(workoutsRef);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}
