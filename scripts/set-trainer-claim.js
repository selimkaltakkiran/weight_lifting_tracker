// Stack — one-off admin script to grant/revoke the "trainer" custom claim on a Firebase Auth user.
//
// This app has no backend server, and custom claims can only be set with the Firebase Admin SDK,
// so this is a manual script you run locally whenever a new trainer account needs the claim.
//
// Setup (once):
//   1. npm install firebase-admin
//   2. Firebase console → Project settings → Service accounts → Generate new private key.
//      Save the downloaded JSON somewhere OUTSIDE this repo (never commit it).
//   3. Set GOOGLE_APPLICATION_CREDENTIALS to that file's path.
//
// Usage:
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json node scripts/set-trainer-claim.js <uid>
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json node scripts/set-trainer-claim.js <uid> --revoke
//
// The target's uid is their Firebase Auth UID (shown in the app's Profile tab once they're a trainer,
// or found in the Firebase console under Authentication → Users).

const admin = require('firebase-admin');

const [, , uid, flag] = process.argv;

if (!uid) {
  console.error('Usage: node scripts/set-trainer-claim.js <uid> [--revoke]');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const grant = flag !== '--revoke';

admin
  .auth()
  .setCustomUserClaims(uid, grant ? { trainer: true } : { trainer: null })
  .then(() => {
    console.log(`${grant ? 'Granted' : 'Revoked'} trainer claim for uid: ${uid}`);
    console.log('The user must sign out and back in (or wait for their next token refresh) to see the change.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Failed to set custom claim:', err);
    process.exit(1);
  });
