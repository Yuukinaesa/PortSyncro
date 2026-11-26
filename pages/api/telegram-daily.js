// pages/api/telegram-daily.js
// Cron endpoint: Send daily portfolio recap to all autopilot users
// Triggered by Vercel Cron (configured in vercel.json) or external cron (e.g. cron-job.org)
//
// Usage:
//   - Vercel Cron: Automatic via vercel.json (sends x-vercel-cron: 1)
//   - External cron: GET /api/telegram-daily?secret=YOUR_CRON_SECRET
//   - Manual / Test run: GET /api/telegram-daily?secret=YOUR_CRON_SECRET&force=true

import { sendDailyReports } from '../../lib/telegramBot.js';
import { secureLogger, timingSafeCompare, RateLimiter } from '../../lib/security.js';

const cronInvocationLimiter = new RateLimiter(60000, 3);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const hasExplicitCronSecret = Boolean(process.env.CRON_SECRET);
  const cronSecret = process.env.CRON_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';

  // 1. Detect Vercel Cron invocation header (Vercel sends Authorization: Bearer <CRON_SECRET> when CRON_SECRET is set)
  const isVercelCron = req.headers['x-vercel-cron'] === '1' || req.headers['user-agent']?.includes('vercel-cron');

  // 2. Detect secret in Authorization header or query parameter
  const authHeader = req.headers.authorization;
  const isBearerAuth = Boolean(cronSecret && authHeader && authHeader.startsWith('Bearer ') && timingSafeCompare(authHeader.slice(7), cronSecret));
  const isQuerySecret = Boolean(cronSecret && typeof req.query.secret === 'string' && timingSafeCompare(req.query.secret, cronSecret));

  // Determine authorization (strictly require secret when CRON_SECRET is configured to defeat UA spoofing)
  const hasSecretAuth = isBearerAuth || isQuerySecret;
  const isAuthorized = hasExplicitCronSecret
    ? (hasSecretAuth || !isProduction)
    : (isVercelCron || hasSecretAuth || !isProduction);

  if (isProduction && !isAuthorized) {
    secureLogger.warn('[Cron] Unauthorized cron invocation attempt');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (isProduction && !hasSecretAuth && !cronInvocationLimiter.isAllowed('cron-header-only')) {
    return res.status(429).json({ error: 'Too many cron trigger attempts' });
  }

  // Force send parameter for manual testing or ad-hoc runs (requires explicit secret in production)
  const requestedForce = req.query.force === 'true' || req.query.test === 'true';
  if (requestedForce && isProduction && !hasSecretAuth) {
    secureLogger.warn('[Cron] Unauthorized force-send attempt rejected');
    return res.status(401).json({ error: 'Unauthorized: secret required for force send' });
  }
  const forceSend = requestedForce;

  secureLogger.log(`[Cron] Starting daily report process (force: ${forceSend}, trigger: ${isVercelCron ? 'vercel-cron' : 'external/manual'})...`);

  try {
    const result = await sendDailyReports({ forceSend });

    secureLogger.log('[Cron] Daily report completed:', result);

    return res.status(200).json({
      ok: true,
      timestamp: new Date().toISOString(),
      forceSend,
      trigger: isVercelCron ? 'vercel-cron' : (isBearerAuth || isQuerySecret ? 'authenticated-request' : 'internal'),
      ...result
    });
  } catch (error) {
    secureLogger.error('[Cron] Daily report error:', error);
    return res.status(500).json({
      ok: false,
      error: isProduction ? 'Internal cron error' : error.message
    });
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 60, // Maximum allowed timeout for Vercel Hobby plan
};
