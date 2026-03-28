// pages/api/telegram-daily.js
// Cron endpoint: Send daily portfolio recap to all autopilot users
// Should be triggered by Vercel Cron or external cron at 00:00 WIB (17:00 UTC)
//
// Usage:
//   - Vercel Cron: add to vercel.json
//   - External cron (e.g. cron-job.org): GET /api/telegram-daily?secret=YOUR_SECRET

import { sendDailyReports } from '../../lib/telegramBot';

export default async function handler(req, res) {
  // Security: Only allow GET with correct secret, or POST from Vercel Cron
  const cronSecret = process.env.CRON_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET;

  if (req.method === 'GET') {
    const { secret } = req.query;
    if (cronSecret && secret !== cronSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  } else if (req.method === 'POST') {
    // Vercel Cron uses POST with Authorization header
    const auth = req.headers.authorization;
    if (cronSecret && auth !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
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
