/** @type {import('next').NextConfig} */
const withPWA = require('@ducanh2912/next-pwa').default({
    dest: 'public',
    register: true,
    skipWaiting: true,
    disable: process.env.NODE_ENV === 'development',
    disableDevLogs: true,
    buildExcludes: [
        /middleware-manifest\.json$/,
        /_middleware\.js$/,
        /proxy\.js$/,
        /_worker\.js$/,
        /dynamic-css-manifest\.json$/
    ],
    // CRITICAL FIX: Disable ALL default runtime caching
    // next-pwa has dangerous defaults that cache /api/* for 24h
    // We explicitly define ONLY what we need below
    workboxOptions: {
        // Disable all default runtime caching rules
        runtimeCaching: []
    },
    // CUSTOM runtime caching - STRICT control
    runtimeCaching: [
        // Rule 1: API routes - ABSOLUTELY NO CACHING
        {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
            options: {
                cacheName: 'no-cache-apis',
                networkTimeoutSeconds: 30,
                plugins: [
                    {
                        // Double safety: prevent ANY response from being cached
                        cacheWillUpdate: async () => null,
                    }
                ]
            }
        },
        // Rule 2: Static assets - CacheFirst is safe
        {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
                cacheName: 'google-fonts',
                expiration: {
                    maxEntries: 10,
                    maxAgeSeconds: 31536000 // 1 year
                }
            }
        }
    ]
});

const nextConfig = {
    reactStrictMode: true,
    outputFileTracingRoot: require('path').join(__dirname),
    // swcMinify dihapus karena sudah tidak didukung

    // Fix WebSocket HMR issues in development
    webpack: (config, { dev, isServer }) => {
        if (dev && !isServer) {
            config.watchOptions = {
                poll: 1000,
                aggregateTimeout: 300,
            };
        }
        return config;
    },

    // Security Headers Configuration
    async headers() {
        const isDev = process.env.NODE_ENV === 'development';
        return [
            {
                // CRITICAL: API routes must NEVER be cached
                source: '/api/:path*',
                headers: [
                    {
                        key: 'Cache-Control',
                        value: 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0',
                    },
                    {
                        key: 'Pragma',
                        value: 'no-cache',
                    },
                    {
                        key: 'Expires',
                        value: '0',
                    },
                    {
                        key: 'CDN-Cache-Control',
                        value: 'no-store',
                    },
                    {
                        key: 'Vercel-CDN-Cache-Control',
                        value: 'no-store',
                    },
                ],
            },
            {
                source: '/(.*)',
                headers: [
                    // Prevent clickjacking
                    {
                        key: 'X-Frame-Options',
                        value: 'DENY'
                    },
                    // Prevent MIME type sniffing
                    {
                        key: 'X-Content-Type-Options',
                        value: 'nosniff'
                    },
                    // Strict referrer policy
                    {
                        key: 'Referrer-Policy',
                        value: 'strict-origin-when-cross-origin'
                    },
                    // Content Security Policy
                    {
                        key: 'Content-Security-Policy',
                        value: [
                            "default-src 'self'",
                            // Remove 'unsafe-eval' in production for better security against XSS
                            `script-src 'self' ${isDev ? "'unsafe-eval'" : ''} 'unsafe-inline' https://www.gstatic.com https://www.googleapis.com https://apis.google.com https://storage.googleapis.com`,
                            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
                            "font-src 'self' https://fonts.gstatic.com data:",
                            "img-src 'self' data: https:",
                            "connect-src 'self' https://api.coingecko.com https://query1.finance.yahoo.com https://query2.finance.yahoo.com https://min-api.cryptocompare.com https://www.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com https://firebase.googleapis.com https://api.exchangerate-api.com https://api.fixer.io https://api.currencylayer.com https://*.firebaseio.com https://*.firebase.com wss://*.firebaseio.com wss://*.firebase.com https://fonts.googleapis.com https://fonts.gstatic.com",
                            "worker-src 'self' blob:",
                            "frame-src 'none'",
                            "object-src 'none'",
                            "base-uri 'self'",
                            "form-action 'self'",
                            "upgrade-insecure-requests"
                        ].join('; ')
                    },
                    // HTTP Strict Transport Security
                    {
                        key: 'Strict-Transport-Security',
                        value: 'max-age=31536000; includeSubDomains; preload'
                    },
                    // Permissions Policy
                    {
                        key: 'Permissions-Policy',
                        value: 'camera=(), microphone=(), geolocation=(), payment=()'
                    },
                    // Additional security headers
                    {
                        key: 'X-DNS-Prefetch-Control',
                        value: 'off'
                    },
                    {
                        key: 'X-Download-Options',
                        value: 'noopen'
                    },
                    {
                        key: 'X-Permitted-Cross-Domain-Policies',
                        value: 'none'
                    }
                ]
            }
        ];
    },

    // Environment Variables Documentation
    // Required: NEXT_PUBLIC_FIREBASE_* (Firebase configuration)
    // Optional: NEXT_PUBLIC_DEMO_EMAIL, NEXT_PUBLIC_DEMO_PASSWORD (Demo account)
    // Demo account enables "Login Demo Account" button on login/register pages
}

module.exports = withPWA(nextConfig);