// lib/firebaseAdmin.js
// Server-side Firebase Admin SDK for Telegram Bot integration
// This bypasses Firestore security rules (admin access)

import * as adminModule from 'firebase-admin';
import { secureLogger } from './security';

const admin = adminModule.default || adminModule;

// Initialize Firebase Admin only once (singleton)
if (admin && admin.apps && !admin.apps.length) {
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
  } else {
    try {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      secureLogger.log('[FirebaseAdmin] Initialized successfully');
    } catch (error) {
      secureLogger.error('[FirebaseAdmin] Initialization failed:', error.message);
    }
  }
}

// Export Firestore instance (admin-level access)
export const adminDb = (admin && admin.apps && admin.apps.length > 0) ? admin.firestore() : null;

export function getAdminDb() {
  if (admin && admin.apps && admin.apps.length > 0) {
    return admin.firestore();
  }
  return adminDb;
}

if (adminDb) {
  try {
    adminDb.settings({ 
      ignoreUndefinedProperties: true
    });
  } catch (error) {
    // Ignore setting errors if already initialized
    secureLogger.warn('[FirebaseAdmin] Settings already applied to this Firestore instance');
  }
}

export const adminAuth = (admin && admin.apps && admin.apps.length > 0) ? admin.auth() : null;
export default admin;
