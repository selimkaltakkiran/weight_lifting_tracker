// Firebase project config — NOT a secret (client identifiers only).
// Real access control comes from firestore.rules, not from hiding this file.
// Fill these in from: Firebase Console → Project settings → General → Your apps → SDK setup.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA8-L0HXTZw8AH1yhcxxL2EZNcRqmm-fSI",
  authDomain: "weight-lifting-tracker-fcc3c.firebaseapp.com",
  projectId: "weight-lifting-tracker-fcc3c",
  storageBucket: "weight-lifting-tracker-fcc3c.firebasestorage.app",
  messagingSenderId: "389199186604",
  appId: "1:389199186604:web:6d9aea039f11163e4d6d09",
  measurementId: "G-10TM7QTSNC",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
