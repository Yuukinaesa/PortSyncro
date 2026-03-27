// lib/firebaseAdmin.js
// Server-side Firebase Admin SDK for Telegram Bot integration
// This bypasses Firestore security rules (admin access)

import admin from 'firebase-admin';

// Initialize Firebase Admin only once (singleton)
if (!admin.apps.length) {
  const serviceAccount = {
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    // Handle both escaped and unescaped newlines in private key
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  };

  // Validate required credentials
  if (!serviceAccount.projectId || !serviceAccount.clientEmail || !serviceAccount.privateKey) {
    console.warn('[FirebaseAdmin] Missing credentials. Telegram Bot features will be unavailable.');
    console.warn('[FirebaseAdmin] Required env vars: NEXT_PUBLIC_FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY');
  } else {
    try {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log('[FirebaseAdmin] Initialized successfully');
    } catch (error) {
      console.error('[FirebaseAdmin] Initialization failed:', error.message);
    }
  }
}

// Export Firestore instance (admin-level access)
export const adminDb = admin.apps.length > 0 ? admin.firestore() : null;
export const adminAuth = admin.apps.length > 0 ? admin.auth() : null;
export default admin;
