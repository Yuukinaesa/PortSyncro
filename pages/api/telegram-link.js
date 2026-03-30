// pages/api/telegram-link.js
// LIGHTWEIGHT Telegram Link API - Uses Firestore REST API directly
// Does NOT import firebase-admin to avoid gRPC hanging on Vercel serverless (504 errors)

import crypto from 'crypto';

// ═══════════════════════════════════════════════════════════════
// ACCESS TOKEN CACHE (persists across warm invocations)
// ═══════════════════════════════════════════════════════════════
let cachedAccessToken = null;
let tokenExpiresAt = 0;

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// ═══════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  try {
    if (req.method === 'POST') {
      return await handleGenerateCode(req, res);
    } else if (req.method === 'GET') {
      return await handleCheckStatus(req, res);
    } else if (req.method === 'DELETE') {
      return await handleUnlink(req, res);
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('[TelegramLink] Unhandled error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// ═══════════════════════════════════════════════════════════════
// ROUTE HANDLERS
// ═══════════════════════════════════════════════════════════════

async function handleCheckStatus(req, res) {
  const uid = await verifyUserToken(req);
  if (!uid) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const userData = await firestoreGet('users', uid);
    if (!userData) return res.status(200).json({ linked: false });

    if (userData.telegramChatId) {
      return res.status(200).json({
        linked: true,
        username: userData.telegramUsername || null,
        linkedAt: userData.telegramLinkedAt || null,
      });
    }
    return res.status(200).json({ linked: false });
  } catch (error) {
    console.error('[TelegramLink] Check status error:', error);
    return res.status(500).json({ error: 'Failed to check status' });
  }
}

async function handleGenerateCode(req, res) {
  const uid = await verifyUserToken(req);
  if (!uid) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const code = generateLinkCode(6);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Get user email
    let email = 'Unknown';
    try {
      const userData = await firestoreGet('users', uid);
      if (userData?.email) email = userData.email;
    } catch { /* ignore */ }

    // Store code
    await firestoreAdd('telegram_link_codes', {
      code: code,
      uid: uid,
      email: email,
      used: false,
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
    });

    return res.status(200).json({
      code: code,
      expiresAt: expiresAt.toISOString(),
      expiresIn: '10 menit',
      instructions: `Kirim perintah ini ke Telegram Bot PortSyncro:\n/link ${code}`
    });
  } catch (error) {
    console.error('[TelegramLink] Generate code error:', error);
    return res.status(500).json({ error: 'Failed to generate link code' });
  }
}

async function handleUnlink(req, res) {
  const uid = await verifyUserToken(req);
  if (!uid) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // Get current chat ID
    const userData = await firestoreGet('users', uid);
    const chatId = userData?.telegramChatId;

    if (chatId) {
      // Remove link document
      await firestoreDelete('telegram_links', String(chatId));
    }

    // Remove telegram fields from user document
    await firestoreDeleteFields('users', uid, [
      'telegramChatId',
      'telegramUsername', 
      'telegramLinkedAt'
    ]);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[TelegramLink] Unlink error:', error);
    return res.status(500).json({ error: 'Failed to unlink' });
  }
}

// ═══════════════════════════════════════════════════════════════
// AUTH: Verify Firebase ID Token via REST API
// ═══════════════════════════════════════════════════════════════

async function verifyUserToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  const idToken = authHeader.split('Bearer ')[1];

  try {
    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
        signal: controller.signal
      }
    );
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.users?.length > 0) return data.users[0].localId;
    }
    return null;
  } catch (error) {
    console.error('[TelegramLink] Auth error:', error.name === 'AbortError' ? 'Timeout' : error);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// FIRESTORE REST API CLIENT (no firebase-admin needed!)
// ═══════════════════════════════════════════════════════════════

async function getServiceAccountToken() {
  // Return cached token if still valid
  if (cachedAccessToken && Date.now() < tokenExpiresAt) {
    return cachedAccessToken;
  }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY || '';

  // Strip surrounding quotes if present
  if ((privateKey.startsWith('"') && privateKey.endsWith('"')) ||
      (privateKey.startsWith("'") && privateKey.endsWith("'"))) {
    privateKey = privateKey.slice(1, -1);
  }
  privateKey = privateKey.replace(/\\n/g, '\n');

  // Create signed JWT for Google OAuth2
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: clientEmail,
    sub: clientEmail,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/datastore'
  })).toString('base64url');

  const signInput = `${header}.${payload}`;
  const signature = crypto.createSign('RSA-SHA256').update(signInput).sign(privateKey, 'base64url');
  const jwt = `${signInput}.${signature}`;

  // Exchange JWT for access token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  });

  if (!tokenRes.ok) {
    throw new Error(`Failed to get access token: ${tokenRes.status}`);
  }

  const tokenData = await tokenRes.json();
  cachedAccessToken = tokenData.access_token;
  tokenExpiresAt = Date.now() + 50 * 60 * 1000; // Cache for 50 min (tokens last 60)
  return cachedAccessToken;
}

// Read a single document
async function firestoreGet(collection, docId) {
  const token = await getServiceAccountToken();
  const res = await fetch(`${FIRESTORE_BASE}/${collection}/${docId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore GET ${collection}/${docId} failed: ${res.status}`);
  return parseFirestoreDoc(await res.json());
}

// Create a document with auto-generated ID
async function firestoreAdd(collection, fields) {
  const token = await getServiceAccountToken();
  const res = await fetch(`${FIRESTORE_BASE}/${collection}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ fields: toFirestoreFields(fields) })
  });
  if (!res.ok) throw new Error(`Firestore ADD to ${collection} failed: ${res.status}`);
}

// Delete a document
async function firestoreDelete(collection, docId) {
  const token = await getServiceAccountToken();
  const res = await fetch(`${FIRESTORE_BASE}/${collection}/${docId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  // 404 is OK (already deleted), other errors should throw
  if (!res.ok && res.status !== 404) {
    throw new Error(`Firestore DELETE ${collection}/${docId} failed: ${res.status}`);
  }
}

// Delete specific fields from a document (equivalent to FieldValue.delete())
async function firestoreDeleteFields(collection, docId, fieldNames) {
  const token = await getServiceAccountToken();
  const params = fieldNames.map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');
  const res = await fetch(`${FIRESTORE_BASE}/${collection}/${docId}?${params}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ fields: {} }) // Empty fields = delete those in updateMask
  });
  if (!res.ok) throw new Error(`Firestore DELETE FIELDS ${collection}/${docId} failed: ${res.status}`);
}

// ═══════════════════════════════════════════════════════════════
// FIRESTORE DATA CONVERSION
// ═══════════════════════════════════════════════════════════════

function toFirestoreFields(obj) {
  const fields = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string') {
      fields[key] = { stringValue: value };
    } else if (typeof value === 'number') {
      fields[key] = Number.isInteger(value)
        ? { integerValue: String(value) }
        : { doubleValue: value };
    } else if (typeof value === 'boolean') {
      fields[key] = { booleanValue: value };
    } else if (value instanceof Date) {
      fields[key] = { timestampValue: value.toISOString() };
    } else {
      fields[key] = { stringValue: String(value) };
    }
  }
  return fields;
}

function parseFirestoreDoc(doc) {
  if (!doc?.fields) return null;
  const result = {};
  for (const [key, val] of Object.entries(doc.fields)) {
    if ('stringValue' in val) result[key] = val.stringValue;
    else if ('integerValue' in val) result[key] = parseInt(val.integerValue, 10);
    else if ('doubleValue' in val) result[key] = val.doubleValue;
    else if ('booleanValue' in val) result[key] = val.booleanValue;
    else if ('timestampValue' in val) result[key] = val.timestampValue;
    else if ('nullValue' in val) result[key] = null;
    else if ('mapValue' in val) result[key] = val.mapValue;
    else if ('arrayValue' in val) result[key] = val.arrayValue;
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════
// LINK CODE GENERATOR
// ═══════════════════════════════════════════════════════════════

function generateLinkCode(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing: I,O,0,1
  const bytes = crypto.randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

export const config = {
  maxDuration: 30, // Give breathing room for cold starts
};
