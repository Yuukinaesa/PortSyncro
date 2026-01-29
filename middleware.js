// proxy.js
// Security proxy for PortSyncro

import { NextResponse } from 'next/server';
import { secureLogger } from './lib/security';

// Security proxy function
export function middleware(request) {
  const { pathname } = request.nextUrl;

  // Log all requests in development
  if (process.env.NODE_ENV !== 'production') {
    secureLogger.log(`[PROXY] ${request.method} ${pathname}`);
  }

  // Security headers for all responses
  const response = NextResponse.next();

  // Additional security headers
  response.headers.set('X-DNS-Prefetch-Control', 'off');
  response.headers.set('X-Download-Options', 'noopen');
  response.headers.set('X-Permitted-Cross-Domain-Policies', 'none');

  // Prevent MIME type sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff');

  // Prevent clickjacking
  response.headers.set('X-Frame-Options', 'DENY');

  // Strict referrer policy
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Content Security Policy - Updated for Firebase and APIs
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://www.gstatic.com https://www.googleapis.com https://apis.google.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    "connect-src 'self' https://api.coingecko.com https://query1.finance.yahoo.com https://query2.finance.yahoo.com https://min-api.cryptocompare.com https://www.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com https://firebase.googleapis.com https://api.exchangerate-api.com https://api.fixer.io https://api.currencylayer.com https://*.firebaseio.com https://*.firebase.com wss://*.firebaseio.com wss://*.firebase.com https://fonts.googleapis.com https://fonts.gstatic.com",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests"
  ].join('; ');

  response.headers.set('Content-Security-Policy', csp);

  // HTTP Strict Transport Security
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

  // Permissions Policy
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

  // API rate limiting check for sensitive endpoints
  if (pathname.startsWith('/api/')) {
    // Add request timestamp for rate limiting
    response.headers.set('X-Request-Timestamp', Date.now().toString());

    // Log API requests in production for monitoring
    if (process.env.NODE_ENV === 'production') {
      secureLogger.log(`[API] ${request.method} ${pathname} - ${request.headers.get('user-agent') || 'Unknown'}`);
    }
  }

  // Protect against common attacks
  const userAgent = request.headers.get('user-agent') || '';
  const suspiciousPatterns = [
    /sqlmap/i,
    /nikto/i,
    /nmap/i,
    /dirb/i,
    /gobuster/i,
    /wfuzz/i,
    /burp/i,
    /zap/i,
    /w3af/i,
    /acunetix/i,
    /nessus/i,
    /openvas/i
  ];

  if (suspiciousPatterns.some(pattern => pattern.test(userAgent))) {
    secureLogger.warn(`[SECURITY] Suspicious user agent detected: ${userAgent}`);
    return new NextResponse('Forbidden', { status: 403 });
  }

  // NOTE: x-forwarded-for, x-real-ip, etc. are LEGITIMATE headers
  // added by proxies/CDNs like Vercel. DO NOT BLOCK THEM.
  // Previous code was blocking these which would break production.

  return response;
}

// Configure which paths the proxy should run on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
};
