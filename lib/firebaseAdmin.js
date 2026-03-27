// lib/firebaseAdmin.js
// Server-side Firebase Admin SDK for Telegram Bot integration
// This bypasses Firestore security rules (admin access)

import admin from 'firebase-admin';

// Initialize Firebase Admin only once (singleton)
if (!admin.apps.length) {
  let privateKey = process.env.FIREBASE_PRIVATE_KEY || '';
  // Strip surrounding quotes if accidentally included
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.slice(1, -1);
  } else if (privateKey.startsWith("'") && privateKey.endsWith("'")) {
    privateKey = privateKey.slice(1, -1);
  }
  
  const serviceAccount = {
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    // Handle both escaped and unescaped newlines in private key
    privateKey: privateKey.replace(/\\n/g, '\n'),
  };

  // Validate required credentials
  if (!serviceAccount.projectId || !serviceAccount.clientEmail || !serviceAccount.privateKey) {
    console.warn('[FirebaseAdmin] Missing credentials. Telegram Bot features will be unavailable.');
    console.warn('[FirebaseAdmin] Set FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY from service account.');
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
