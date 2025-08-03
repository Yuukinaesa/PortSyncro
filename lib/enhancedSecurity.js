// lib/enhancedSecurity.js
// Enhanced security middleware using additional security packages

import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { secureLogger } from './securityMonitoring';

// Enhanced CORS configuration
export const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:3000',
      'https://localhost:3000',
      'https://yourdomain.com', // Replace with your actual domain
      'https://www.yourdomain.com'
    ];
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      secureLogger.warn(`CORS blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['X-Total-Count', 'X-Request-Timestamp']
};

// Enhanced rate limiting
export const createRateLimiter = (windowMs = 60000, max = 30, message = 'Too many requests') => {
  return rateLimit({
    windowMs,
    max,
    message: {
      error: 'RATE_LIMIT_EXCEEDED',
      message,
      retryAfter: Math.ceil(windowMs / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      secureLogger.warn(`Rate limit exceeded for ${req.ip} on ${req.path}`);
      res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message,
        retryAfter: Math.ceil(windowMs / 1000)
      });
    },
    keyGenerator: (req) => {
      // Use user ID if available, otherwise use IP
      return req.user?.uid || req.ip;
    }
  });
};

// Enhanced helmet configuration
export const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-eval'",
        "'unsafe-inline'",
        "https://www.gstatic.com",
        "https://www.googleapis.com",
        "https://apis.google.com"
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://fonts.googleapis.com"
      ],
      fontSrc: [
        "'self'",
        "https://fonts.gstatic.com"
      ],
      imgSrc: [
        "'self'",
        "data:",
        "https:"
      ],
      connectSrc: [
        "'self'",
        "https://api.coingecko.com",
        "https://query1.finance.yahoo.com",
        "https://www.googleapis.com",
        "https://identitytoolkit.googleapis.com",
        "https://securetoken.googleapis.com",
        "https://firestore.googleapis.com",
        "https://firebase.googleapis.com",
        "https://api.exchangerate-api.com",
        "https://api.fixer.io",
        "https://api.currencylayer.com",
        "https://*.firebaseio.com",
        "https://*.firebase.com",
        "wss://*.firebaseio.com",
        "wss://*.firebase.com"
      ],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: []
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginResourcePolicy: { policy: "cross-origin" },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: "deny" },
  hidePoweredBy: true,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  ieNoOpen: true,
  noSniff: true,
  permittedCrossDomainPolicies: { permittedPolicies: "none" },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  xssFilter: true
});

// Security middleware for API routes
export const apiSecurityMiddleware = [
  helmetConfig,
  cors(corsOptions),
  createRateLimiter(60000, 30, 'API rate limit exceeded'),
  (req, res, next) => {
    // Add security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    
    // Log API requests in production
    if (process.env.NODE_ENV === 'production') {
      secureLogger.log(`API Request: ${req.method} ${req.path} from ${req.ip}`);
    }
    
    next();
  }
];

// Security middleware for general routes
export const generalSecurityMiddleware = [
  helmetConfig,
  cors(corsOptions),
  (req, res, next) => {
    // Add security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    next();
  }
];

// Enhanced security monitoring
export const enhancedSecurityMonitor = {
  // Track suspicious patterns
  suspiciousPatterns: new Map(),
  
  // Track failed authentication attempts
  failedAuthAttempts: new Map(),
  
  // Track unusual activity
  unusualActivity: new Map(),
  
  recordSuspiciousPattern: (pattern, details) => {
    const timestamp = Date.now();
    const key = `${pattern}_${timestamp}`;
    
    enhancedSecurityMonitor.suspiciousPatterns.set(key, {
      pattern,
      details,
      timestamp,
      count: (enhancedSecurityMonitor.suspiciousPatterns.get(key)?.count || 0) + 1
    });
    
    secureLogger.warn(`Suspicious pattern detected: ${pattern}`, details);
  },
  
  recordFailedAuth: (identifier, details) => {
    const attempts = enhancedSecurityMonitor.failedAuthAttempts.get(identifier) || 0;
    enhancedSecurityMonitor.failedAuthAttempts.set(identifier, attempts + 1);
    
    if (attempts + 1 >= 5) {
      secureLogger.warn(`Multiple failed auth attempts for ${identifier}`, details);
    }
  },
  
  recordUnusualActivity: (type, details) => {
    const timestamp = Date.now();
    const key = `${type}_${timestamp}`;
    
    enhancedSecurityMonitor.unusualActivity.set(key, {
      type,
      details,
      timestamp
    });
    
    secureLogger.warn(`Unusual activity detected: ${type}`, details);
  },
  
  // Cleanup old data
  cleanup: () => {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const oneDay = 24 * oneHour;
    
    // Clean suspicious patterns older than 1 hour
    for (const [key, data] of enhancedSecurityMonitor.suspiciousPatterns.entries()) {
      if (now - data.timestamp > oneHour) {
        enhancedSecurityMonitor.suspiciousPatterns.delete(key);
      }
    }
    
    // Clean failed auth attempts older than 1 hour
    for (const [key, timestamp] of enhancedSecurityMonitor.failedAuthAttempts.entries()) {
      if (now - timestamp > oneHour) {
        enhancedSecurityMonitor.failedAuthAttempts.delete(key);
      }
    }
    
    // Clean unusual activity older than 24 hours
    for (const [key, data] of enhancedSecurityMonitor.unusualActivity.entries()) {
      if (now - data.timestamp > oneDay) {
        enhancedSecurityMonitor.unusualActivity.delete(key);
      }
    }
  }
};

// Run cleanup every hour
if (typeof window === 'undefined') {
  setInterval(() => {
    enhancedSecurityMonitor.cleanup();
  }, 60 * 60 * 1000); // 1 hour
}

// Export for use in other files
const enhancedSecurityExports = {
  corsOptions,
  createRateLimiter,
  helmetConfig,
  apiSecurityMiddleware,
  generalSecurityMiddleware,
  enhancedSecurityMonitor
};

export default enhancedSecurityExports; 