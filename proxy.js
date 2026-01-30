// proxy.js
// Security proxy for PortSyncro

import { NextResponse } from 'next/server';
import { secureLogger } from './lib/security';

// Security proxy function
export function proxy(request) {
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

  // Content Security Policy is handled in next.config.js to allow conditional 'unsafe-eval' in dev
  // and stricter policies in production. Avoiding duplicate headers.
  // const csp = ...

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
