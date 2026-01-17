// lib/security.js
// Security utilities for PortSyncro

const isProduction = process.env.NODE_ENV === 'production';

// Secure logging utility
export const secureLogger = {
  log: (...args) => {
    if (!isProduction) {
      console.log('[DEV]', ...args);
    }
  },
  error: (...args) => {
    // Always log errors but sanitize in production
    if (isProduction) {
      const sanitizedArgs = args.map(arg => {
        if (typeof arg === 'string') {
          return arg
            .replace(/password["\s]*[:=]["\s]*[^,\s}]+/gi, 'password: [REDACTED]')
            .replace(/api[_-]?key["\s]*[:=]["\s]*[^,\s}]+/gi, 'api_key: [REDACTED]')
            .replace(/token["\s]*[:=]["\s]*[^,\s}]+/gi, 'token: [REDACTED]');
        }
        if (typeof arg === 'object' && arg !== null) {
          try {
            const str = JSON.stringify(arg);
            return str
              .replace(/"password"\s*:\s*"[^"]*"/gi, '"password": "[REDACTED]"')
              .replace(/"api[_-]?key"\s*:\s*"[^"]*"/gi, '"api_key": "[REDACTED]"')
              .replace(/"token"\s*:\s*"[^"]*"/gi, '"token": "[REDACTED]"');
          } catch (e) {
            return '[Circular/Unserializable Object]';
          }
        }
        return arg;
      });
      console.error('[PROD]', ...sanitizedArgs);
    } else {
      console.error('[DEV]', ...args);
    }
  },
  warn: (...args) => {
    console.warn(isProduction ? '[PROD]' : '[DEV]', ...args);
  }
};

// Input validation and sanitization
export const validateInput = {
  email: (email) => {
    if (!email || typeof email !== 'string') return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim()) && email.length <= 254;
  },

  password: (password) => {
    if (!password || typeof password !== 'string') return false;
    // Strict Password Policy:
    // - At least one uppercase letter
    // - At least one lowercase letter
    // - At least one number
    // - At least one special character (any non-alphanumeric)
    // - Minimum 8 characters
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,128}$/;
    return passwordRegex.test(password);
  },

  stockSymbol: (symbol) => {
    if (!symbol || typeof symbol !== 'string') return false;
    // Allow alphanumeric and some special characters, max 10 chars
    const symbolRegex = /^[A-Za-z0-9.-]{1,10}$/;
    return symbolRegex.test(symbol.trim());
  },

  cryptoSymbol: (symbol) => {
    if (!symbol || typeof symbol !== 'string') return false;
    // Allow alphanumeric, max 20 chars
    const symbolRegex = /^[A-Za-z0-9]{1,20}$/;
    return symbolRegex.test(symbol.trim());
  },

  amount: (amount) => {
    if (typeof amount !== 'number' || isNaN(amount)) return false;
    return amount > 0 && amount <= 999999999.99; // Max 999M
  },

  price: (price) => {
    if (typeof price !== 'number' || isNaN(price)) return false;
    return price >= 0 && price <= 999999.99; // Max 999K
  }
};

// Sanitize user input
export const sanitizeInput = {
  string: (input) => {
    if (typeof input !== 'string') return '';
    return input
      .trim()
      .replace(/[<>]/g, '') // Remove potential HTML tags
      .substring(0, 1000); // Limit length
  },

  number: (input) => {
    const num = parseFloat(input);
    return isNaN(num) ? 0 : num;
  },

  object: (obj) => {
    if (typeof obj !== 'object' || obj === null) return {};

    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        sanitized[key] = sanitizeInput.string(value);
      } else if (typeof value === 'number') {
        sanitized[key] = sanitizeInput.number(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = sanitizeInput.object(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }
};

// Rate limiting utility
export class RateLimiter {
  constructor(windowMs = 60000, maxRequests = 30) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.requests = new Map();
  }

  isAllowed(identifier) {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    if (!this.requests.has(identifier)) {
      this.requests.set(identifier, []);
    }

    const requests = this.requests.get(identifier);
    const validRequests = requests.filter(timestamp => timestamp > windowStart);

    if (validRequests.length >= this.maxRequests) {
      return false;
    }

    validRequests.push(now);
    this.requests.set(identifier, validRequests);
    return true;
  }

  cleanup() {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    for (const [identifier, requests] of this.requests.entries()) {
      const validRequests = requests.filter(timestamp => timestamp > windowStart);
      if (validRequests.length === 0) {
        this.requests.delete(identifier);
      } else {
        this.requests.set(identifier, validRequests);
      }
    }
  }
}

// CSRF protection utility
// CSRF protection utility
export const generateCSRFToken = () => {
  if (typeof crypto !== 'undefined') {
    if (typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    if (typeof crypto.getRandomValues === 'function') {
      const array = new Uint8Array(24);
      crypto.getRandomValues(array);
      return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }
  }
  // Fallback for Node.js environment if crypto is not globally available (though it usually is in recent Node)
  try {
    const nodeCrypto = require('crypto');
    return nodeCrypto.randomBytes(24).toString('hex');
  } catch (e) {
    // Should not happen in modern environments, but improved fallback
    console.error('Secure RNG not available for CSRF');
    return Date.now().toString(36) + 'secure' + Math.random().toString(36).substr(2);
  }
};

// Secure session management
export const sessionSecurity = {
  validateSession: (user) => {
    if (!user || !user.uid) return false;

    // Check if user has valid email
    if (!user.email || !validateInput.email(user.email)) return false;

    // Check if user is not disabled
    if (user.disabled) return false;

    return true;
  },

  sanitizeUserData: (user) => {
    if (!user) return null;

    return {
      uid: user.uid,
      email: user.email,
      emailVerified: user.emailVerified,
      displayName: user.displayName ? sanitizeInput.string(user.displayName) : null,
      photoURL: user.photoURL,
      disabled: user.disabled,
      metadata: {
        creationTime: user.metadata?.creationTime,
        lastSignInTime: user.metadata?.lastSignInTime
      }
    };
  }
};

// Error handling with security
export const secureErrorHandler = {
  handle: (error, context = '') => {
    const errorInfo = {
      message: isProduction ? 'An error occurred' : error.message,
      code: error.code || 'UNKNOWN_ERROR',
      context,
      timestamp: new Date().toISOString()
    };

    secureLogger.error('Error occurred:', errorInfo);

    // Don't expose internal errors in production
    if (isProduction) {
      return {
        message: 'An error occurred. Please try again later.',
        code: 'INTERNAL_ERROR'
      };
    }

    return errorInfo;
  },

  isSensitiveError: (error) => {
    const sensitivePatterns = [
      /password/i,
      /api[_-]?key/i,
      /token/i,
      /secret/i,
      /credential/i
    ];

    return sensitivePatterns.some(pattern =>
      pattern.test(error.message || '') ||
      pattern.test(error.code || '')
    );
  }
}; 