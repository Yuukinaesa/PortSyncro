/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    // swcMinify dihapus karena sudah tidak didukung

    // Security Headers Configuration
    async headers() {
        return [
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
                            "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://www.gstatic.com https://www.googleapis.com https://apis.google.com",
                            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
                            "font-src 'self' https://fonts.gstatic.com",
                            "img-src 'self' data: https:",
                            "connect-src 'self' https://api.coingecko.com https://query1.finance.yahoo.com https://query2.finance.yahoo.com https://min-api.cryptocompare.com https://www.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com https://firebase.googleapis.com https://api.exchangerate-api.com https://api.fixer.io https://api.currencylayer.com https://*.firebaseio.com https://*.firebase.com wss://*.firebaseio.com wss://*.firebase.com",
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

module.exports = nextConfig