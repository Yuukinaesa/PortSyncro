// pages/api/telegram.js
// Telegram Bot Webhook Endpoint for PortSyncro
// Receives updates from Telegram and routes them to the bot handler

import { handleUpdate, handleCallbackQuery } from '../../lib/telegramBot';

// Rate limiting for webhook (prevent abuse)
const webhookRateLimit = new Map();
const WEBHOOK_RATE_LIMIT_WINDOW = 1000; // 1 second
const WEBHOOK_RATE_LIMIT_MAX = 10; // max 10 updates per second per chat

function checkWebhookRateLimit(chatId) {
  const now = Date.now();
  const key = String(chatId);
  
  if (!webhookRateLimit.has(key)) {
    webhookRateLimit.set(key, [now]);
    return true;
  }
  
  const timestamps = webhookRateLimit.get(key).filter(t => t > now - WEBHOOK_RATE_LIMIT_WINDOW);
  
  if (timestamps.length >= WEBHOOK_RATE_LIMIT_MAX) {
    return false;
  }
  
  timestamps.push(now);
  webhookRateLimit.set(key, timestamps);
  
  // Lazy cleanup (1% chance)
  if (Math.random() < 0.01) {
    const cutoff = now - WEBHOOK_RATE_LIMIT_WINDOW * 10;
    for (const [id, times] of webhookRateLimit.entries()) {
      const valid = times.filter(t => t > cutoff);
      if (valid.length === 0) webhookRateLimit.delete(id);
      else webhookRateLimit.set(id, valid);
    }
  }
  
  return true;
}

export default async function handler(req, res) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ═══════════════════════════════════════════════════════════════
  // SECURITY: Verify Telegram webhook secret
  // ═══════════════════════════════════════════════════════════════
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  
  if (webhookSecret) {
    const requestSecret = req.headers['x-telegram-bot-api-secret-token'];
    if (requestSecret !== webhookSecret) {
      console.warn('[Telegram Webhook] Invalid secret token detected - Rejecting request.');
      return res.status(401).json({ error: 'Unauthorized payload' });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // VALIDATE: Check required environment variables
  // ═══════════════════════════════════════════════════════════════
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error('[Telegram Webhook] TELEGRAM_BOT_TOKEN not set');
    return res.status(500).json({ error: 'Bot not configured' });
  }

  try {
    const update = req.body;

    // Validate update structure
    if (!update || (!update.message && !update.callback_query)) {
      return res.status(200).json({ ok: true }); // Acknowledge but ignore
    }

    // Get chat ID for rate limiting
    const chatId = update.message?.chat?.id || update.callback_query?.message?.chat?.id;
    
    // Rate limit check
    if (chatId && !checkWebhookRateLimit(chatId)) {
      console.warn(`[Telegram Webhook] Rate limit exceeded for chat ${chatId}`);
      return res.status(200).json({ ok: true }); // Acknowledge but don't process
    }

    // Route to appropriate handler
    if (update.callback_query) {
      // Handle inline keyboard button presses
      await handleCallbackQuery(update.callback_query);
    } else if (update.message) {
      // Handle text messages and commands
      await handleUpdate(update);
    }

    // Always respond 200 to Telegram (prevent retries)
    return res.status(200).json({ ok: true });

  } catch (error) {
    console.error('[Telegram Webhook] Error processing update:', error);
    
    // Still respond 200 to prevent Telegram from retrying
    // (retrying would just cause the same error)
    return res.status(200).json({ ok: true, error: 'Internal processing error' });
  }
}

// Disable body parsing limit increase for webhook
// (Telegram updates are small, but be safe)
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
  maxDuration: 60, // Give the webhook maximum breathing room on Vercel Hobby
};
