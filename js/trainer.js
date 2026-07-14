// Stack — trainer-side client list and "viewing as client" state
import { db } from './firebase-config.js';
import { currentUser } from './auth.js';
import {
  collection,
  query,
  where,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

export async function getClients() {
  if (!currentUser) return [];

  const usersRef = collection(db, 'users');
  const q = query(usersRef, where('trainerIds', 'array-contains', currentUser.uid));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export let activeClientUid = null;
export let activeClientEmail = '';

export function setActiveClient(uid, email = '') {
  activeClientUid = uid;
  activeClientEmail = email;
}

export function clearActiveClient() {
  activeClientUid = null;
  activeClientEmail = '';
}
