// Stack — auth (sign up / sign in / sign out) and auth-gate UI wiring
import { auth } from './firebase-config.js';
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

export let currentUser = null;
export let isTrainer = false;

const viewAuth = document.getElementById('view-auth');
const tabBar = document.querySelector('.tab-bar');
const authForm = document.getElementById('auth-form');
const authEmailInput = document.getElementById('auth-email');
const authPasswordInput = document.getElementById('auth-password');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authToggleModeBtn = document.getElementById('auth-toggle-mode');
const authErrorEl = document.getElementById('auth-error');
const googleSignInBtn = document.getElementById('btn-google-signin');

const profileEmailEl = document.getElementById('profile-email');
const signOutBtn = document.getElementById('btn-sign-out');

let isSignupMode = false;

const ERROR_MESSAGES = {
  'auth/wrong-password': 'Incorrect password.',
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/user-not-found': 'No account found with that email.',
  'auth/email-already-in-use': 'An account already exists with that email.',
  'auth/weak-password': 'Password should be at least 6 characters.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
};

function showAuthError(err) {
  const message = ERROR_MESSAGES[err?.code] || err?.message || 'Something went wrong.';
  authErrorEl.textContent = message;
  authErrorEl.hidden = false;
}

function clearAuthError() {
  authErrorEl.hidden = true;
  authErrorEl.textContent = '';
}

function setAuthLoading(loading) {
  authSubmitBtn.disabled = loading;
  authSubmitBtn.textContent = loading
    ? (isSignupMode ? 'Signing up…' : 'Signing in…')
    : (isSignupMode ? 'Sign up' : 'Sign in');
}

export function showAuthGate() {
  viewAuth.hidden = false;
  if (tabBar) tabBar.hidden = true;
}

export function hideAuthGate() {
  viewAuth.hidden = true;
  if (tabBar) tabBar.hidden = false;
}

authToggleModeBtn.addEventListener('click', () => {
  isSignupMode = !isSignupMode;
  authToggleModeBtn.textContent = isSignupMode
    ? 'Already have an account? Sign in'
    : 'Need an account? Sign up';
  setAuthLoading(false);
  clearAuthError();
});

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAuthError();
  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value;
  if (!email || !password) return;

  setAuthLoading(true);
  try {
    if (isSignupMode) {
      await createUserWithEmailAndPassword(auth, email, password);
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
  } catch (err) {
    showAuthError(err);
  } finally {
    setAuthLoading(false);
  }
});

googleSignInBtn.addEventListener('click', async () => {
  clearAuthError();
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (err) {
    showAuthError(err);
  }
});

if (signOutBtn) {
  signOutBtn.addEventListener('click', () => {
    signOut(auth);
  });
}

export function initAuth(onSignedIn, onSignedOut) {
  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (user) {
      hideAuthGate();
      if (profileEmailEl) profileEmailEl.textContent = user.email || '';
      try {
        const tokenResult = await user.getIdTokenResult(true);
        isTrainer = tokenResult.claims.trainer === true;
      } catch (err) {
        console.warn('Failed to refresh ID token:', err);
        isTrainer = false;
      }
      onSignedIn(user);
    } else {
      isTrainer = false;
      showAuthGate();
      onSignedOut();
    }
  });
}
