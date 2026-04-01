/**
 * One-time fix: removes the corrupted 'notes' view permission from Firestore
 * so it falls back to "allow all" (the code default).
 *
 * Run with:  node scripts/fix-notes-permission.mjs
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, updateDoc, deleteField } from 'firebase/firestore';

const config = {
  projectId:         'gen-lang-client-0122413243',
  appId:             '1:983499443154:web:e6b4d31efae9e7d4f6160b',
  apiKey:            'AIzaSyDsBsQ632Vl3K5qjIjaovFtHoTrtxCGjL4',
  authDomain:        'gen-lang-client-0122413243.firebaseapp.com',
  storageBucket:     'gen-lang-client-0122413243.firebasestorage.app',
  messagingSenderId: '983499443154',
};

const app  = initializeApp(config);
const db   = getFirestore(app, 'ai-studio-9153c9e2-8066-4a49-996e-75268af5f0e2');
const ref  = doc(db, 'settings', 'fieldPermissions');

const snap = await getDoc(ref);
if (!snap.exists()) {
  console.log('settings/fieldPermissions does not exist — nothing to fix.');
  process.exit(0);
}

const data = snap.data();
console.log('Current fieldPermissions:', JSON.stringify(data, null, 2));

if (!data.notes) {
  console.log("'notes' key not present — no fix needed.");
  process.exit(0);
}

await updateDoc(ref, { notes: deleteField() });
console.log("✓ Removed 'notes' from fieldPermissions. Notes are now visible to all roles.");
process.exit(0);
