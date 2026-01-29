// lib/firebase.js
import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, initializeFirestore, memoryLocalCache } from 'firebase/firestore';

// ... imports ...

// Konfigurasi Firebase via ENV
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

let app;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

export const auth = getAuth(app);

// Initialize Firestore with persistent cache (modern approach)
// Initialize Firestore with memory cache only (Strict Cloud Sync requirement)
// "❌ Tidak boleh ada offline mode", "❌ Tidak boleh ada local-only data"
let firestoreDb;
try {
  firestoreDb = initializeFirestore(app, {
    localCache: memoryLocalCache()
  });
} catch (error) {
  // Fallback if already initialized (though shouldn't happen in singleton module)
  firestoreDb = getFirestore(app);
}

export const db = firestoreDb;
