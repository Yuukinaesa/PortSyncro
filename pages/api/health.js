// pages/api/health.js
// Health check endpoint for monitoring and load balancers

export default function handler(req, res) {
    // Only allow GET requests
    if (req.method !== 'GET') {
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
            error: 'Missing critical environment variables',
            missing: missingEnvVars,
            timestamp: new Date().toISOString()
        });
        return;
    }

    // All checks passed
    res.status(200).json(health);
}
