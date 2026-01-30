// pages/api/health.js
// Simple health check endpoint for connection quality testing

export default function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // HEAD request for lightweight ping
    if (req.method === 'HEAD') {
        res.status(200).end();
        return;
    }

    // GET request returns simple status
    if (req.method === 'GET') {
        res.status(200).json({
            status: 'ok',
            timestamp: new Date().toISOString()
        });
        return;
    }

    // Method not allowed
    res.status(405).json({ error: 'Method not allowed' });
}
