// pages/api/telegram.js
// Telegram Bot Webhook & Diagnostics Endpoint for PortSyncro
// Handles webhook updates from Telegram and provides 1-click self-healing diagnostics

import { handleUpdate, handleCallbackQuery, getTelegramApi } from '../../lib/telegramBot.js';
import { getAdminDb } from '../../lib/firebaseAdmin.js';
import { secureLogger, timingSafeCompare } from '../../lib/security.js';

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
  
  // Deterministic lazy cleanup when map grows (no Math.random in security-sensitive code)
  if (webhookRateLimit.size > 100) {
    const cutoff = now - WEBHOOK_RATE_LIMIT_WINDOW * 10;
    for (const [id, times] of webhookRateLimit.entries()) {
      const valid = times.filter(t => t > cutoff);
      if (valid.length === 0) webhookRateLimit.delete(id);
      else webhookRateLimit.set(id, valid);
    }
    if (webhookRateLimit.size > 1000) {
      const oldestKey = webhookRateLimit.keys().next().value;
      if (oldestKey !== undefined) webhookRateLimit.delete(oldestKey);
    }
  }
  
  return true;
}

const TELEGRAM_API_TIMEOUT_MS = 8000;

function callTelegramBotApi(botToken, method, payload = null) {
  const url = `https://api.telegram.org/bot${botToken}/${method}`;
  if (!payload) {
    return fetch(url, { signal: AbortSignal.timeout(TELEGRAM_API_TIMEOUT_MS) });
  }
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(TELEGRAM_API_TIMEOUT_MS)
  });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || '';
  const cronSecret = process.env.CRON_SECRET || webhookSecret;

  // ═══════════════════════════════════════════════════════════════
  // 1. GET: Diagnostics & 1-Click Auto Setup (Admin Secret Protected)
  // ═══════════════════════════════════════════════════════════════
  if (req.method === 'GET') {
    const rawHost = (req.headers.host || '').toLowerCase().trim();
    const isProduction = process.env.NODE_ENV === 'production';
    const hostParts = rawHost.split(':');
    const portNum = hostParts.length === 2 ? Number(hostParts[1]) : null;
    const isLocalHost = (hostParts[0] === 'localhost' || hostParts[0] === '127.0.0.1') &&
                        (hostParts.length === 1 || (portNum !== null && Number.isInteger(portNum) && portNum > 0 && portNum <= 65535));
    const isProductionDomain = rawHost === 'portsyncro.arfan.biz.id' || rawHost === 'www.portsyncro.arfan.biz.id';
    const isAllowedHost = isProduction ? isProductionDomain : (isProductionDomain || isLocalHost);

    // Fail-closed in production: require valid CRON_SECRET / TELEGRAM_WEBHOOK_SECRET before leaking diagnostics or calling Telegram API
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const querySecret = typeof req.query.secret === 'string' ? req.query.secret : '';
    const hasValidSecret = Boolean(cronSecret) && (
      timingSafeCompare(bearerToken, cronSecret) || timingSafeCompare(querySecret, cronSecret)
    );

    if (isProduction && !hasValidSecret) {
      return res.status(401).json({
        ok: false,
        error: 'Unauthorized'
      });
    }

    if (!botToken) {
      return res.status(200).json({
        ok: false,
        error: 'TELEGRAM_BOT_TOKEN environment variable is not configured',
        hint: 'Please set TELEGRAM_BOT_TOKEN in Vercel Project Settings > Environment Variables, then redeploy.'
      });
    }

    // Canonical deployment URL pinned strictly to production domain (prevents Host Header webhook hijacking)
    const targetBaseUrl = (!isProduction && isLocalHost)
      ? `http://${rawHost}`
      : 'https://portsyncro.arfan.biz.id';
    const currentWebhookUrl = `${targetBaseUrl}/api/telegram`;

    // 1-Click Setup: Register webhook & bot commands
    if (req.query.setup === 'true' || req.query.setWebhook === 'true') {
      if (!isAllowedHost) {
        return res.status(403).json({
          ok: false,
          error: 'Forbidden: Untrusted host header detected.'
        });
      }

      if (isProduction && (!cronSecret || !hasValidSecret)) {
        return res.status(401).json({
          ok: false,
          error: 'Unauthorized: Valid secret token required to modify webhook.'
        });
      }

      try {
        const setupPayload = {
          url: currentWebhookUrl,
          allowed_updates: ['message', 'channel_post', 'callback_query'],
          drop_pending_updates: true
        };
        if (webhookSecret) {
          setupPayload.secret_token = webhookSecret;
        }

        const setResp = await callTelegramBotApi(botToken, 'setWebhook', setupPayload);
        const setResult = await setResp.json();

        // Also register complete bot commands menu in Telegram
        const commands = [
          { command: 'start', description: 'Mulai bot & menu utama' },
          { command: 'status', description: 'Cek status koneksi akun' },
          { command: 'link', description: 'Hubungkan akun PortSyncro (/link KODE)' },
          { command: 'unlink', description: 'Putuskan koneksi Telegram' },
          { command: 'porto', description: 'Rekap ringkas portfolio (format chat)' },
          { command: 'portfolio', description: 'Lihat ringkasan portfolio lengkap' },
          { command: 'pnl', description: 'Lihat ringkasan untung/rugi (P/L)' },
          { command: 'saham', description: 'Daftar kepemilikan saham' },
          { command: 'crypto', description: 'Daftar kepemilikan cryptocurrency' },
          { command: 'emas', description: 'Daftar kepemilikan emas' },
          { command: 'cash', description: 'Daftar saldo bank & kas' },
          { command: 'hargaporto', description: 'Harga terkini aset di portfolio' },
          { command: 'harga', description: 'Cek harga ticker spesifik' },
          { command: 'beli', description: 'Catat transaksi beli aset' },
          { command: 'jual', description: 'Catat transaksi jual aset' },
          { command: 'addcash', description: 'Tambah saldo bank / kas' },
          { command: 'setcash', description: 'Set nominal saldo bank mutlak' },
          { command: 'addgold', description: 'Catat pembelian emas' },
          { command: 'hapus', description: 'Hapus aset dari portofolio' },
          { command: 'riwayat', description: 'Riwayat transaksi terakhir' },
          { command: 'autopilot', description: 'Atur jadwal kirim rekap harian' },
          { command: 'setname', description: 'Ganti identitas tampilan di grup' },
          { command: 'help', description: 'Panduan lengkap perintah' }
        ];

        await callTelegramBotApi(botToken, 'setMyCommands', { commands });

        // Query fresh webhook info after setup
        const infoResp = await callTelegramBotApi(botToken, 'getWebhookInfo');
        const infoResult = await infoResp.json();
        if (infoResult.result && infoResult.result.ip_address) {
          delete infoResult.result.ip_address; // Prevent exposing server egress IP
        }

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
          error: process.env.NODE_ENV === 'production'
            ? 'Failed to configure webhook'
            : 'Failed to configure webhook: ' + err.message
        });
      }
    }

    // Regular GET: Diagnostic inspection
    try {
      const [meResp, infoResp] = await Promise.all([
        callTelegramBotApi(botToken, 'getMe'),
        callTelegramBotApi(botToken, 'getWebhookInfo')
      ]);
      const meData = await meResp.json();
      const infoData = await infoResp.json();

      if (infoData.result && infoData.result.ip_address) {
        delete infoData.result.ip_address; // Prevent exposing server egress IP
      }

      const registeredUrl = infoData.result?.url || '';
      const isMatching = registeredUrl === currentWebhookUrl;

      // Check database status without blocking network call
      let dbStatus = 'missing_credentials';
      let dbError = null;
      try {
        const db = getAdminDb();
        dbStatus = db ? 'ready' : 'missing_credentials';
      } catch (e) {
        dbStatus = 'init_error';
        dbError = process.env.NODE_ENV === 'production' ? 'Database initialization error' : e.message;
      }

      return res.status(200).json({
        ok: true,
        bot: meData.result || null,
        webhook: infoData.result || null,
        database: {
          status: dbStatus,
          hasClientEmail: Boolean(process.env.FIREBASE_CLIENT_EMAIL),
          hasPrivateKey: Boolean(process.env.FIREBASE_PRIVATE_KEY),
          error: dbError
        },
        currentDomainWebhookUrl: currentWebhookUrl,
        isWebhookUrlMatching: isMatching,
        hasWebhookSecretEnv: Boolean(webhookSecret),
        instructions: {
          setup: `To automatically register or fix webhook to point to this deployment, open: ${currentWebhookUrl}?setup=true`
        }
      });
    } catch (err) {
      secureLogger.error('[Telegram Webhook Diagnostics] Error:', err);
      return res.status(500).json({
        ok: false,
        error: process.env.NODE_ENV === 'production'
          ? 'Failed to query Telegram API'
          : 'Failed to query Telegram API: ' + err.message
      });
    }
  }

  // Only accept POST requests for incoming updates
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ═══════════════════════════════════════════════════════════════
  // 2. SECURITY: Strict Telegram webhook secret verification (fail-closed in production)
  // ═══════════════════════════════════════════════════════════════
  const rawHeader = req.headers['x-telegram-bot-api-secret-token'];
  const requestSecret = typeof rawHeader === 'string' ? rawHeader : '';
  if ((process.env.NODE_ENV === 'production' && !webhookSecret) || (webhookSecret && (!requestSecret || !timingSafeCompare(requestSecret, webhookSecret)))) {
    secureLogger.warn('[Telegram Webhook] Missing or invalid secret token detected - Rejecting request.');
    return res.status(401).json({ error: 'Unauthorized payload' });
  }

  if (!botToken) {
    secureLogger.error('[Telegram Webhook] TELEGRAM_BOT_TOKEN not set');
    return res.status(500).json({ error: 'Bot not configured' });
  }

  try {
    const update = req.body;

    // Validate update structure: support message, callback_query, channel_post, edited_message, edited_channel_post
    const messageObj = update?.message || update?.channel_post || update?.edited_message || update?.edited_channel_post;
    if (!update || (!messageObj && !update.callback_query)) {
      return res.status(200).json({ ok: true }); // Acknowledge but ignore empty pings
    }

    // Get chat ID for rate limiting
    const chatId = messageObj?.chat?.id || update.callback_query?.message?.chat?.id;
    
    // Rate limit check
    if (chatId && !checkWebhookRateLimit(chatId)) {
      secureLogger.warn(`[Telegram Webhook] Rate limit exceeded for chat ${chatId}`);
      return res.status(200).json({ ok: true }); // Acknowledge but don't process
    }

    // Route to appropriate handler
    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
    } else if (messageObj) {
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
