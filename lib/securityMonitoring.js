// lib/securityMonitoring.js
// Security monitoring and logging utilities

const isProduction = process.env.NODE_ENV === 'production';

// Secure logging utility that prevents sensitive data exposure
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
            .replace(/token["\s]*[:=]["\s]*[^,\s}]+/gi, 'token: [REDACTED]')
            .replace(/secret["\s]*[:=]["\s]*[^,\s}]+/gi, 'secret: [REDACTED]');
        }
        if (typeof arg === 'object' && arg !== null) {
          try {
            const str = JSON.stringify(arg);
            return str
              .replace(/"password"\s*:\s*"[^"]*"/gi, '"password": "[REDACTED]"')
              .replace(/"api[_-]?key"\s*:\s*"[^"]*"/gi, '"api_key": "[REDACTED]"')
              .replace(/"token"\s*:\s*"[^"]*"/gi, '"token": "[REDACTED]"')
              .replace(/"secret"\s*:\s*"[^"]*"/gi, '"secret": "[REDACTED]"');
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
  },

  info: (...args) => {
    if (!isProduction) {
      console.info('[DEV]', ...args);
    }
  }
};

// Security monitoring for suspicious activities
export const securityMonitor = {
  // Track failed login attempts
  failedLogins: new Map(),

  // Track API rate limit violations
  rateLimitViolations: new Map(),

  // Track suspicious patterns
  suspiciousPatterns: new Map(),

  recordFailedLogin: (email, ip) => {
    const key = `${email}_${ip}`;
    const attempts = securityMonitor.failedLogins.get(key) || 0;
    securityMonitor.failedLogins.set(key, attempts + 1);

    if (attempts + 1 >= 5) {
      secureLogger.warn(`Multiple failed login attempts detected for ${email} from ${ip}`);
    }
  },

  recordRateLimitViolation: (identifier, endpoint) => {
    const key = `${identifier}_${endpoint}`;
    const violations = securityMonitor.rateLimitViolations.get(key) || 0;
    securityMonitor.rateLimitViolations.set(key, violations + 1);

    if (violations + 1 >= 3) {
      secureLogger.warn(`Rate limit violations detected for ${identifier} on ${endpoint}`);
    }
  },

  recordSuspiciousActivity: (type, details) => {
    const timestamp = new Date().toISOString();
    const key = `${type}_${timestamp.split('T')[0]}`;
    const activities = securityMonitor.suspiciousPatterns.get(key) || [];
    activities.push({ type, details, timestamp });
    securityMonitor.suspiciousPatterns.set(key, activities);

    secureLogger.warn(`Suspicious activity detected: ${type}`, details);
  },

  // Clean up old data periodically
  cleanup: () => {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    // Clean failed logins older than 1 hour
    for (const [key, timestamp] of securityMonitor.failedLogins.entries()) {
      if (now - timestamp > oneHour) {
        securityMonitor.failedLogins.delete(key);
      }
    }

    // Clean rate limit violations older than 1 hour
    for (const [key, timestamp] of securityMonitor.rateLimitViolations.entries()) {
      if (now - timestamp > oneHour) {
        securityMonitor.rateLimitViolations.delete(key);
      }
    }

    // Clean suspicious patterns older than 24 hours
    const oneDay = 24 * oneHour;
    for (const [key, activities] of securityMonitor.suspiciousPatterns.entries()) {
      const filteredActivities = activities.filter(activity =>
        now - new Date(activity.timestamp).getTime() < oneDay
      );
      if (filteredActivities.length === 0) {
        securityMonitor.suspiciousPatterns.delete(key);
      } else {
        securityMonitor.suspiciousPatterns.set(key, filteredActivities);
      }
    }
  }
};

// Run cleanup every hour
if (typeof window === 'undefined') {
  setInterval(() => {
    securityMonitor.cleanup();
  }, 60 * 60 * 1000); // 1 hour
}

// Export for use in other files
const securityMonitoringExports = { secureLogger, securityMonitor };

export default securityMonitoringExports; 