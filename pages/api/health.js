// pages/api/health.js
// Health check endpoint for monitoring and load balancers

export default function handler(req, res) {
    // Allow GET and HEAD requests (HEAD is used by browsers/monitoring for preflight checks)
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.status(405).json({ error: 'Method Not Allowed' });
        return;
    }

    // Basic health check
    const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        version: '1.0.0'
    };

    // Check critical environment variables (without exposing values)
    const criticalEnvVars = [
        'ENCRYPTION_KEY',
        'NEXT_PUBLIC_FIREBASE_API_KEY',
        'NEXT_PUBLIC_FIREBASE_PROJECT_ID'
    ];

    const missingEnvVars = criticalEnvVars.filter(key => !process.env[key]);

    if (missingEnvVars.length > 0) {
        res.status(503).json({
            status: 'unhealthy',
            error: 'Server is missing required configuration',
            timestamp: new Date().toISOString()
        });
        return;
    }

    // All checks passed
    res.status(200).json(health);
}
