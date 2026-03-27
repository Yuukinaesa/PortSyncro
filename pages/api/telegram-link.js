// pages/api/telegram-link.js
// API endpoint for generating and managing Telegram link codes
// Called from the web app to create verification codes for account linking

import { adminDb } from '../../lib/firebaseAdmin';

export default async function handler(req, res) {
  // CORS and cache headers
  res.setHeader('Cache-Control', 'no-store');
  
  if (req.method === 'POST') {
    return handleGenerateCode(req, res);
  } else if (req.method === 'GET') {
    return handleCheckStatus(req, res);
  } else if (req.method === 'DELETE') {
    return handleUnlink(req, res);
  }
  
  return res.status(405).json({ error: 'Method not allowed' });
}

/**
 * Generate a 6-character link code for Telegram account binding
 */
async function handleGenerateCode(req, res) {
  // Verify authentication
  const uid = await verifyAuth(req);
  if (!uid) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!adminDb) {
    return res.status(500).json({ error: 'Database not available' });
  }

  try {
    // Generate random 6-character code
    const code = generateCode(6);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    // Get user email for display in bot
    let email = 'Unknown';
    try {
      const userDoc = await adminDb.collection('users').doc(uid).get();
      if (userDoc.exists) {
        email = userDoc.data().email || email;
      }
    } catch { /* ignore */ }

    // Store code in Firestore
    await adminDb.collection('telegram_link_codes').add({
      code: code,
      uid: uid,
      email: email,
      used: false,
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt,
    });

    return res.status(200).json({
      code: code,
      expiresAt: expiresAt.toISOString(),
      expiresIn: '10 menit',
      instructions: `Kirim perintah ini ke Telegram Bot PortSyncro:\n/link ${code}`
    });

  } catch (error) {
    console.error('[TelegramLink] Error generating code:', error);
    return res.status(500).json({ error: 'Failed to generate link code' });
  }
}

/**
 * Check if the current user has a linked Telegram account
 */
async function handleCheckStatus(req, res) {
  const uid = await verifyAuth(req);
  if (!uid) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!adminDb) {
    return res.status(500).json({ error: 'Database not available' });
  }

  try {
    const userDoc = await adminDb.collection('users').doc(uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};

    if (userData.telegramChatId) {
      return res.status(200).json({
        linked: true,
        username: userData.telegramUsername || null,
        linkedAt: userData.telegramLinkedAt || null,
      });
    }

    return res.status(200).json({ linked: false });
  } catch (error) {
    console.error('[TelegramLink] Error checking status:', error);
    return res.status(500).json({ error: 'Failed to check status' });
  }
}

/**
 * Unlink Telegram account from web app side
 */
async function handleUnlink(req, res) {
  const uid = await verifyAuth(req);
  if (!uid) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!adminDb) {
    return res.status(500).json({ error: 'Database not available' });
  }

  try {
    // Get current chat ID
    const userDoc = await adminDb.collection('users').doc(uid).get();
    const chatId = userDoc.exists ? userDoc.data().telegramChatId : null;

    if (chatId) {
      // Remove link document
      await adminDb.collection('telegram_links').doc(String(chatId)).delete();
    }

    // Remove from user document
    const admin = (await import('firebase-admin')).default;
    await adminDb.collection('users').doc(uid).update({
      telegramChatId: admin.firestore.FieldValue.delete(),
      telegramUsername: admin.firestore.FieldValue.delete(),
      telegramLinkedAt: admin.firestore.FieldValue.delete(),
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[TelegramLink] Error unlinking:', error);
    return res.status(500).json({ error: 'Failed to unlink' });
  }
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Verify Firebase ID token from request headers
 */
async function verifyAuth(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  const token = authHeader.split('Bearer ')[1];

  try {
    // Use Google Identity Toolkit REST API (same approach as prices.js)
    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    const verifyResponse = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token })
      }
    );

    if (verifyResponse.ok) {
      const data = await verifyResponse.json();
      if (data.users && data.users.length > 0) {
        return data.users[0].localId;
      }
    }
    return null;
  } catch (error) {
    console.error('[TelegramLink] Auth verification error:', error);
    return null;
  }
}

/**
 * Generate a random alphanumeric code
 */
function generateCode(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars: I,O,0,1
  let code = '';
  const bytes = new Uint8Array(length);
  
  // Use crypto if available, fallback to Math.random
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
    for (let i = 0; i < length; i++) {
      code += chars[bytes[i] % chars.length];
    }
  } else {
    for (let i = 0; i < length; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
  }
  
  return code;
}
