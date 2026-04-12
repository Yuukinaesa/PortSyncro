// pages/api/telegram-daily.js
// Cron endpoint: Send daily portfolio recap to all autopilot users
// Should be triggered by Vercel Cron or external cron at 00:00 WIB (17:00 UTC)
//
// Usage:
//   - Vercel Cron: add to vercel.json
//   - External cron (e.g. cron-job.org): GET /api/telegram-daily?secret=YOUR_SECRET

import { sendDailyReports } from '../../lib/telegramBot';

export default async function handler(req, res) {
  // Security: Check both query parameter and Authorization header for cron secret
  const cronSecret = process.env.CRON_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET;

  const authHeader = req.headers.authorization;
  const isVercelCron = cronSecret && authHeader === `Bearer ${cronSecret}`;
  const isQuerySecret = cronSecret && req.query.secret === cronSecret;

  if (cronSecret && !isVercelCron && !isQuerySecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('[Cron] Starting daily report send...');

  try {
    const result = await sendDailyReports();

    console.log('[Cron] Daily report result:', result);

    return res.status(200).json({
      ok: true,
      timestamp: new Date().toISOString(),
      ...result
    });
  } catch (error) {
    console.error('[Cron] Daily report error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}

// Allow longer timeout for cron (Vercel Pro: 300s, Hobby: 10s)
// For Hobby plan, the stagger logic handles this via multiple quick calls
export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 60, // Max for Vercel Hobby plan
};
