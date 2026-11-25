// lib/firebaseAdmin.js
// Server-side Firebase Admin SDK for Telegram Bot integration
// This bypasses Firestore security rules (admin access)

import { initializeApp, getApps, getApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { secureLogger } from './security';

let appInstance = null;
let firestoreInstance = null;
let authInstance = null;

export let adminDb = null;
export let adminAuth = null;

export function initFirebaseAdmin() {
  if (firestoreInstance) {
    adminDb = firestoreInstance;
    adminAuth = authInstance;
    return { app: appInstance, adminDb: firestoreInstance, adminAuth: authInstance };
  }

  const existingApps = getApps();
  if (existingApps.length > 0) {
    appInstance = existingApps[0];
    try {
      firestoreInstance = getFirestore(appInstance);
      try {
        firestoreInstance.settings({
          ignoreUndefinedProperties: true
        });
      } catch {
        // Ignore setting errors if already initialized
      }
      authInstance = getAuth(appInstance);
      adminDb = firestoreInstance;
      adminAuth = authInstance;
      return { app: appInstance, adminDb: firestoreInstance, adminAuth: authInstance };
    } catch (err) {
      secureLogger.error('[FirebaseAdmin] Failed getting firestore from existing app:', err.message);
    }
  }

  let privateKey = process.env.FIREBASE_PRIVATE_KEY || '';
  try {
    privateKey = JSON.parse(privateKey);
  } catch {
    if ((privateKey.startsWith('"') && privateKey.endsWith('"')) ||
        (privateKey.startsWith("'") && privateKey.endsWith("'"))) {
      privateKey = privateKey.slice(1, -1);
    }
  }
  privateKey = (privateKey || '').replace(/\\n/g, '\n').trim();

  let clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || '').trim();
  if ((clientEmail.startsWith('"') && clientEmail.endsWith('"')) ||
      (clientEmail.startsWith("'") && clientEmail.endsWith("'"))) {
    clientEmail = clientEmail.slice(1, -1).trim();
  }

  const projectId = (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || '').trim();

  const serviceAccount = {
    projectId,
    clientEmail,
    privateKey,
  };

  // Validate required credentials
  if (!serviceAccount.projectId || !serviceAccount.clientEmail || !serviceAccount.privateKey) {
    secureLogger.warn('[FirebaseAdmin] Missing credentials. Telegram Bot features will be unavailable.');
    secureLogger.warn('[FirebaseAdmin] Set FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY from service account.');
    adminDb = null;
    adminAuth = null;
    return { app: null, adminDb: null, adminAuth: null };
  }

  try {
    appInstance = initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.projectId,
    });
    firestoreInstance = getFirestore(appInstance);
    try {
      firestoreInstance.settings({
        ignoreUndefinedProperties: true
      });
    } catch {
      // Ignore setting errors if already initialized
    }
    authInstance = getAuth(appInstance);
    adminDb = firestoreInstance;
    adminAuth = authInstance;
    secureLogger.log('[FirebaseAdmin] Initialized successfully');
    return { app: appInstance, adminDb: firestoreInstance, adminAuth: authInstance };
  } catch (error) {
    secureLogger.error('[FirebaseAdmin] Initialization failed:', error.message);
    adminDb = null;
    adminAuth = null;
    return { app: null, adminDb: null, adminAuth: null };
  }
}

// Auto-run initialization at module load
initFirebaseAdmin();

export function getAdminDb() {
  if (!firestoreInstance) {
    initFirebaseAdmin();
  }
  return firestoreInstance;
}

export function getAdminAuth() {
  if (!authInstance) {
    initFirebaseAdmin();
  }
  return authInstance;
}

export { FieldValue };

const adminCompat = {
  get app() { return appInstance; },
  get apps() { return getApps(); },
  getApps,
  getApp,
  initializeApp,
  cert,
  firestore: Object.assign(
    () => getAdminDb(),
    { FieldValue }
  ),
  auth: () => getAdminAuth()
};

export default adminCompat;
