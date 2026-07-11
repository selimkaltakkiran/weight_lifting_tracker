// Stack — Firestore-backed session storage (per-user), with localStorage as an offline cache
import { db } from './firebase-config.js';
import { currentUser } from './auth.js';
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  doc,
  getDoc,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const STORAGE_KEY = 'stack.sessions';
const PROFILE_STORAGE_KEY = 'stack.profile';

function readLocalSessions() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function writeLocalSessions(sessions) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

function readLocalProfile() {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function writeLocalProfile(profile) {
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
}

export async function getSessions() {
  if (!currentUser) return readLocalSessions();

  const sessionsRef = collection(db, 'users', currentUser.uid, 'sessions');
  const q = query(sessionsRef, orderBy('startedAt'));
  const snapshot = await getDocs(q);
  const sessions = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

  writeLocalSessions(sessions);
  return sessions;
}

export async function addSession(session) {
  if (!currentUser) {
    const sessions = readLocalSessions();
    const withId = { id: crypto.randomUUID(), ...session };
    sessions.push(withId);
    writeLocalSessions(sessions);
    return withId;
  }

  const sessionsRef = collection(db, 'users', currentUser.uid, 'sessions');
  await addDoc(sessionsRef, session);
  return session;
}

export async function updateSessionExercises(sessionId, exercises) {
  if (!currentUser) {
    const sessions = readLocalSessions();
    const idx = sessions.findIndex((s) => s.id === sessionId);
    if (idx === -1) return;
    sessions[idx] = { ...sessions[idx], exercises };
    writeLocalSessions(sessions);
    return;
  }

  const sessionRef = doc(db, 'users', currentUser.uid, 'sessions', sessionId);
  await setDoc(sessionRef, { exercises }, { merge: true });
}

export async function getUserProfile() {
  if (!currentUser) return readLocalProfile();

  const userRef = doc(db, 'users', currentUser.uid);
  const userSnap = await getDoc(userRef);
  const data = userSnap.exists() ? userSnap.data() : {};
  const profile = {
    gender: data.gender || '',
    age: data.age ?? null,
    height: data.height ?? null,
    weight: data.weight ?? null,
  };

  writeLocalProfile(profile);
  return profile;
}

export async function updateUserProfile(profile) {
  if (!currentUser) {
    writeLocalProfile(profile);
    return;
  }

  const userRef = doc(db, 'users', currentUser.uid);
  await setDoc(userRef, profile, { merge: true });
  writeLocalProfile(profile);
}

export async function migrateLocalDataIfNeeded() {
  if (!currentUser) return;

  const userRef = doc(db, 'users', currentUser.uid);
  const userSnap = await getDoc(userRef);
  if (userSnap.exists() && userSnap.data().migratedLocalData) return;

  const localSessions = readLocalSessions();
  if (localSessions.length > 0) {
    const sessionsRef = collection(db, 'users', currentUser.uid, 'sessions');
    await Promise.all(
      localSessions.map(({ id, ...session }) => addDoc(sessionsRef, session))
    );
  }

  await setDoc(userRef, { migratedLocalData: true }, { merge: true });
}
