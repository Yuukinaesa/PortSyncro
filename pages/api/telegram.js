// pages/api/telegram.js
// Telegram Bot Webhook & Diagnostics Endpoint for PortSyncro
// Handles webhook updates from Telegram and provides 1-click self-healing diagnostics

import { handleUpdate, handleCallbackQuery, getTelegramApi } from '../../lib/telegramBot';
import { secureLogger, timingSafeCompare } from '../../lib/security';

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
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || '';

  // ═══════════════════════════════════════════════════════════════
  // 1. GET: Diagnostics & 1-Click Auto Setup
  // ═══════════════════════════════════════════════════════════════
  if (req.method === 'GET') {
    if (!botToken) {
      return res.status(200).json({
        ok: false,
        error: 'TELEGRAM_BOT_TOKEN environment variable is not configured',
        hint: 'Please set TELEGRAM_BOT_TOKEN in Vercel Project Settings > Environment Variables, then redeploy.'
      });
    }

    const host = req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const currentWebhookUrl = `${proto}://${host}/api/telegram`;

    // 1-Click Setup: Register webhook & bot commands
    if (req.query.setup === 'true' || req.query.setWebhook === 'true') {
      try {
        const setupPayload = {
          url: currentWebhookUrl,
          drop_pending_updates: true
        };
        if (webhookSecret) {
          setupPayload.secret_token = webhookSecret;
        }

        const setResp = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(setupPayload)
        });
        const setResult = await setResp.json();

        // Also register bot commands menu in Telegram
        const commands = [
          { command: 'start', description: 'Mulai bot & menu utama' },
          { command: 'status', description: 'Cek status koneksi akun' },
          { command: 'link', description: 'Hubungkan akun PortSyncro (/link KODE)' },
          { command: 'porto', description: 'Rekap ringkas portfolio (format chat)' },
          { command: 'portfolio', description: 'Lihat ringkasan portfolio lengkap' },
          { command: 'pnl', description: 'Lihat ringkasan untung/rugi (P/L)' },
          { command: 'saham', description: 'Daftar kepemilikan saham' },
          { command: 'crypto', description: 'Daftar kepemilikan cryptocurrency' },
          { command: 'emas', description: 'Daftar kepemilikan emas' },
          { command: 'cash', description: 'Daftar saldo bank & kas' },
          { command: 'hargaporto', description: 'Harga terkini aset di portfolio' },
          { command: 'riwayat', description: 'Riwayat transaksi terakhir' },
          { command: 'autopilot', description: 'Atur jadwal kirim rekap harian' },
          { command: 'help', description: 'Panduan lengkap perintah' }
        ];

        await fetch(`https://api.telegram.org/bot${botToken}/setMyCommands`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ commands })
        });

        // Query fresh webhook info after setup
        const infoResp = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
        const infoResult = await infoResp.json();

        return res.status(200).json({
          ok: setResult.ok,
          message: setResult.ok ? 'Webhook and commands successfully registered on Telegram!' : 'Webhook registration failed',
          setWebhookResponse: setResult,
          webhookInfo: infoResult.result || null,
          targetUrl: currentWebhookUrl,
          hasSecret: Boolean(webhookSecret)
        });
      } catch (err) {
        secureLogger.error('[Telegram Webhook Setup] Error:', err);
        return res.status(500).json({
          ok: false,
          error: 'Failed to configure webhook: ' + err.message
        });
      }
    }

    // Regular GET: Diagnostic inspection
    try {
      const [meResp, infoResp] = await Promise.all([
        fetch(`https://api.telegram.org/bot${botToken}/getMe`),
        fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`)
      ]);
      const meData = await meResp.json();
      const infoData = await infoResp.json();

      const registeredUrl = infoData.result?.url || '';
      const isMatching = registeredUrl === currentWebhookUrl;

      return res.status(200).json({
        ok: true,
        bot: meData.result || null,
        webhook: infoData.result || null,
        currentDomainWebhookUrl: currentWebhookUrl,
        isWebhookUrlMatching: isMatching,
        hasWebhookSecretEnv: Boolean(webhookSecret),
        instructions: {
          setup: `To automatically register or fix webhook to point to this deployment, open: ${currentWebhookUrl}?setup=true`
        }
      });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: 'Failed to query Telegram API: ' + err.message
      });
    }
  }

  // Only accept POST requests for incoming updates
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ═══════════════════════════════════════════════════════════════
  // 2. SECURITY: Verify Telegram webhook secret token
  // ═══════════════════════════════════════════════════════════════
  if (webhookSecret) {
    const requestSecret = req.headers['x-telegram-bot-api-secret-token'];
    if (requestSecret) {
      if (!timingSafeCompare(requestSecret, webhookSecret)) {
        secureLogger.warn('[Telegram Webhook] Invalid secret token detected - Rejecting request.');
        return res.status(401).json({ error: 'Unauthorized payload' });
      }
    } else {
      secureLogger.warn('[Telegram Webhook] Notice: Webhook update received without x-telegram-bot-api-secret-token. Proceeding in permissive mode.');
    }
  }

  if (!botToken) {
    secureLogger.error('[Telegram Webhook] TELEGRAM_BOT_TOKEN not set');
    return res.status(500).json({ error: 'Bot not configured' });
  }

  try {
    const update = req.body;

    // Validate update structure
    if (!update || (!update.message && !update.callback_query)) {
      return res.status(200).json({ ok: true }); // Acknowledge but ignore empty pings
    }

    // Get chat ID for rate limiting
    const chatId = update.message?.chat?.id || update.callback_query?.message?.chat?.id;
    
    // Rate limit check
    if (chatId && !checkWebhookRateLimit(chatId)) {
      secureLogger.warn(`[Telegram Webhook] Rate limit exceeded for chat ${chatId}`);
      return res.status(200).json({ ok: true }); // Acknowledge but don't process
    }

    // Route to appropriate handler
    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
    } else if (update.message) {
      await handleUpdate(update);
    }

    // Always respond 200 to Telegram (prevents Telegram retry loops)
    return res.status(200).json({ ok: true });

  } catch (error) {
    secureLogger.error('[Telegram Webhook] Error processing update:', error);
    
    // Respond 200 to prevent Telegram from continually retrying on unhandled errors
    return res.status(200).json({ ok: true, error: 'Internal processing error' });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
  maxDuration: 60, // Give webhook maximum breathing room
};
