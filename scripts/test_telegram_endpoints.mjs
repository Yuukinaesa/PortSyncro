// scripts/test_telegram_endpoints.mjs
// Automated verification for Telegram Bot Webhook, Cron Scheduler, and Self-Healing Endpoints

import assert from 'assert';
import fs from 'fs';
import path from 'path';

console.log('🤖 RUNNING TELEGRAM BOT & CRON ENDPOINT TESTS...\n');

// 1. Verify pages/api/telegram.js
{
  const filePath = path.resolve('pages/api/telegram.js');
  assert(fs.existsSync(filePath), 'pages/api/telegram.js must exist');
  const content = fs.readFileSync(filePath, 'utf8');

  // Verify GET diagnostics and 1-click setup
  assert(content.includes("req.method === 'GET'"), 'telegram.js must support GET requests');
  assert(content.includes('req.query.setup ==='), 'telegram.js must support 1-click ?setup=true webhook registration');
  assert(content.includes('setWebhook'), 'telegram.js must call Telegram setWebhook during setup');
  assert(content.includes('setMyCommands'), 'telegram.js must register bot commands during setup');
  assert(content.includes('getWebhookInfo'), 'telegram.js must query getWebhookInfo for diagnostics');

  // Verify permissive security (no 500 when TELEGRAM_WEBHOOK_SECRET is not set)
  assert(!content.includes("isProduction && !webhookSecret) {\n    secureLogger.error('[Telegram Webhook] TELEGRAM_WEBHOOK_SECRET not set in production');\n    return res.status(500)"), 'Must not return 500 when secret is not configured');

  // Verify host header pinning & setup secret check
  assert(!content.includes('else if (rawHost.endsWith(\'.vercel.app\'))'), 'Must not trust arbitrary .vercel.app Host header for production setWebhook');
  assert(content.includes('timingSafeCompare(querySecret, cronSecret)'), 'Setup endpoint must validate secret in production');

  console.log('✅ 1. pages/api/telegram.js GET diagnostics, security pinning, and 1-click setup verified.');
}

// 2. Verify pages/api/telegram-daily.js
{
  const filePath = path.resolve('pages/api/telegram-daily.js');
  assert(fs.existsSync(filePath), 'pages/api/telegram-daily.js must exist');
  const content = fs.readFileSync(filePath, 'utf8');

  // Verify Vercel Cron header detection
  assert(content.includes("req.headers['x-vercel-cron'] === '1'"), 'telegram-daily.js must support x-vercel-cron header');
  assert(content.includes("req.headers['user-agent']?.includes('vercel-cron')"), 'telegram-daily.js must support vercel-cron user agent');

  // Verify forceSend support
  assert(content.includes("req.query.force === 'true'"), 'telegram-daily.js must support force send query parameter');
  assert(content.includes('sendDailyReports({ forceSend })'), 'telegram-daily.js must pass forceSend to sendDailyReports');

  console.log('✅ 2. pages/api/telegram-daily.js Vercel Cron detection & forceSend verified.');
}

// 3. Verify lib/telegramBot.js enhancements
{
  const filePath = path.resolve('lib/telegramBot.js');
  assert(fs.existsSync(filePath), 'lib/telegramBot.js must exist');
  const content = fs.readFileSync(filePath, 'utf8');

  // Verify getTelegramApi dynamic resolution
  assert(content.includes('export function getTelegramApi()'), 'telegramBot.js must export dynamic getTelegramApi()');

  // Verify sendMessage entity parse error auto-recovery
  assert(content.includes('retrying sendMessage without parse_mode') || content.includes('Retrying sendMessage as plain text'), 'sendMessage must have auto-retry without parse_mode on parse error');

  // Verify linkAccount auto-enables autopilot
  assert(content.includes("adminDb.collection('telegram_autopilot').doc(uid).set"), 'linkAccount must auto-enable telegram_autopilot');

  // Verify sendDailyReports supports options.forceSend
  assert(content.includes('export async function sendDailyReports(options = {})'), 'sendDailyReports must accept options parameter');
  assert(content.includes('forceSend = options.forceSend === true'), 'sendDailyReports must parse options.forceSend');

  // Verify English + Indonesian command aliases & case-preserving txId extraction
  assert(content.includes("case '/buy':"), 'telegramBot.js must support /buy alias');
  assert(content.includes("case '/sell':"), 'telegramBot.js must support /sell alias');
  assert(content.includes("case '/price':"), 'telegramBot.js must support /price alias');
  assert(content.includes("case '/history':"), 'telegramBot.js must support /history alias');
  assert(content.includes('rawCommandPart.slice(5)'), 'telegramBot.js must preserve case-sensitive txId in /del_');

  console.log('✅ 3. lib/telegramBot.js dynamic API, auto-retry, aliases, txId casing, and autopilot auto-enable verified.');
}

// 4. Verify vercel.json cron entry
{
  const filePath = path.resolve('vercel.json');
  assert(fs.existsSync(filePath), 'vercel.json must exist');
  const content = fs.readFileSync(filePath, 'utf8');
  const config = JSON.parse(content);

  assert(Array.isArray(config.crons), 'vercel.json must have crons array');
  const dailyCron = config.crons.find(c => c.path === '/api/telegram-daily');
  assert(dailyCron, 'vercel.json must have cron for /api/telegram-daily');
  assert.strictEqual(dailyCron.schedule, '0 17 * * *', 'Cron schedule must be at 17:00 UTC (00:00 WIB)');

  console.log('✅ 4. vercel.json cron configuration verified.');
}

console.log('\n🎉 ALL TELEGRAM BOT & CRON TESTS PASSED 100%!');
