// pages/api/health.js
// Simple health check endpoint for connection quality testing

export default function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // HEAD request for lightweight ping
    if (req.method === 'HEAD') {
        return res.status(200).end();
    }

    // GET request returns simple status
    if (req.method === 'GET') {
        return res.status(200).json({
            status: 'ok',
            timestamp: new Date().toISOString()
        });
    }

    // Method not allowed
    return res.status(405).json({ error: 'Method not allowed' });
}
