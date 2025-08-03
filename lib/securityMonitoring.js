// lib/securityMonitoring.js
// Advanced security monitoring and threat detection

import { secureLogger } from './security';

// Security event types
const SECURITY_EVENTS = {
  SUSPICIOUS_ACTIVITY: 'SUSPICIOUS_ACTIVITY',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  INVALID_INPUT: 'INVALID_INPUT',
  AUTHENTICATION_FAILURE: 'AUTHENTICATION_FAILURE',
  CSRF_ATTEMPT: 'CSRF_ATTEMPT',
  XSS_ATTEMPT: 'XSS_ATTEMPT',
  SQL_INJECTION_ATTEMPT: 'SQL_INJECTION_ATTEMPT',
  SUSPICIOUS_USER_AGENT: 'SUSPICIOUS_USER_AGENT',
  MULTIPLE_FAILED_LOGINS: 'MULTIPLE_FAILED_LOGINS',
  UNUSUAL_ACCESS_PATTERN: 'UNUSUAL_ACCESS_PATTERN'
};

// Security monitoring class
class SecurityMonitor {
  constructor() {
    this.events = [];
    this.suspiciousIPs = new Map();
    this.failedLogins = new Map();
    this.userActivity = new Map();
    this.threatLevel = 'LOW';
    this.maxEvents = 1000; // Keep last 1000 events
  }

  // Log security event
  logEvent(eventType, details, severity = 'MEDIUM') {
    const event = {
      id: this.generateEventId(),
      type: eventType,
      details,
      severity,
      timestamp: new Date().toISOString(),
      ip: details.ip || 'unknown',
      userAgent: details.userAgent || 'unknown',
      userId: details.userId || null
    };

    this.events.push(event);
    
    // Keep only recent events
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    // Update threat level
    this.updateThreatLevel();
    
    // Log to secure logger
    secureLogger.warn(`[SECURITY] ${eventType}:`, {
      severity,
      ip: event.ip,
      userAgent: event.userAgent,
      userId: event.userId
    });

    // Check for immediate threats
    this.checkImmediateThreats(event);

    return event;
  }

  // Generate unique event ID
  generateEventId() {
    return `sec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Check for immediate threats
  checkImmediateThreats(event) {
    const { ip, userId, type } = event;

    // Track failed logins
    if (type === SECURITY_EVENTS.AUTHENTICATION_FAILURE) {
      this.trackFailedLogin(ip, userId);
    }

    // Track suspicious IPs
    if (type === SECURITY_EVENTS.SUSPICIOUS_ACTIVITY) {
      this.trackSuspiciousIP(ip);
    }

    // Check for multiple failed logins
    if (this.getFailedLoginCount(ip) > 5) {
      this.logEvent(SECURITY_EVENTS.MULTIPLE_FAILED_LOGINS, {
        ip,
        count: this.getFailedLoginCount(ip)
      }, 'HIGH');
    }
  }

  // Track failed login attempts
  trackFailedLogin(ip, userId) {
    const key = `${ip}_${userId || 'anonymous'}`;
    const current = this.failedLogins.get(key) || 0;
    this.failedLogins.set(key, current + 1);

    // Reset after 1 hour
    setTimeout(() => {
      this.failedLogins.delete(key);
    }, 60 * 60 * 1000);
  }

  // Get failed login count
  getFailedLoginCount(ip) {
    let total = 0;
    for (const [key, count] of this.failedLogins.entries()) {
      if (key.startsWith(ip)) {
        total += count;
      }
    }
    return total;
  }

  // Track suspicious IPs
  trackSuspiciousIP(ip) {
    const current = this.suspiciousIPs.get(ip) || 0;
    this.suspiciousIPs.set(ip, current + 1);

    // Reset after 24 hours
    setTimeout(() => {
      this.suspiciousIPs.delete(ip);
    }, 24 * 60 * 60 * 1000);
  }

  // Update threat level based on recent events
  updateThreatLevel() {
    const recentEvents = this.events.filter(event => 
      Date.now() - new Date(event.timestamp).getTime() < 60 * 60 * 1000 // Last hour
    );

    const highSeverityEvents = recentEvents.filter(event => event.severity === 'HIGH').length;
    const mediumSeverityEvents = recentEvents.filter(event => event.severity === 'MEDIUM').length;

    if (highSeverityEvents > 10) {
      this.threatLevel = 'CRITICAL';
    } else if (highSeverityEvents > 5 || mediumSeverityEvents > 20) {
      this.threatLevel = 'HIGH';
    } else if (highSeverityEvents > 2 || mediumSeverityEvents > 10) {
      this.threatLevel = 'MEDIUM';
    } else {
      this.threatLevel = 'LOW';
    }
  }

  // Get security statistics
  getSecurityStats() {
    const now = Date.now();
    const last24Hours = this.events.filter(event => 
      now - new Date(event.timestamp).getTime() < 24 * 60 * 60 * 1000
    );

    return {
      totalEvents: this.events.length,
      eventsLast24Hours: last24Hours.length,
      threatLevel: this.threatLevel,
      suspiciousIPs: this.suspiciousIPs.size,
      failedLogins: this.failedLogins.size,
      eventTypes: this.getEventTypeBreakdown(),
      recentThreats: this.getRecentThreats()
    };
  }

  // Get event type breakdown
  getEventTypeBreakdown() {
    const breakdown = {};
    this.events.forEach(event => {
      breakdown[event.type] = (breakdown[event.type] || 0) + 1;
    });
    return breakdown;
  }

  // Get recent threats
  getRecentThreats() {
    const now = Date.now();
    return this.events
      .filter(event => 
        event.severity === 'HIGH' && 
        now - new Date(event.timestamp).getTime() < 60 * 60 * 1000
      )
      .slice(-10);
  }

  // Check if IP is suspicious
  isSuspiciousIP(ip) {
    return this.suspiciousIPs.get(ip) > 3;
  }

  // Check if user should be blocked
  shouldBlockUser(ip, userId) {
    const failedLogins = this.getFailedLoginCount(ip);
    const isSuspicious = this.isSuspiciousIP(ip);
    
    return failedLogins > 10 || isSuspicious;
  }

  // Get security recommendations
  getSecurityRecommendations() {
    const stats = this.getSecurityStats();
    const recommendations = [];

    if (stats.threatLevel === 'CRITICAL') {
      recommendations.push('Immediate action required: Review all recent security events');
    }

    if (stats.failedLogins > 20) {
      recommendations.push('High number of failed logins detected - consider implementing CAPTCHA');
    }

    if (stats.suspiciousIPs > 10) {
      recommendations.push('Multiple suspicious IPs detected - consider IP blocking');
    }

    return recommendations;
  }
}

// Global security monitor instance
const securityMonitor = new SecurityMonitor();

// Export security monitoring functions
export const securityMonitoring = {
  // Log security events
  logSuspiciousActivity: (details) => 
    securityMonitor.logEvent(SECURITY_EVENTS.SUSPICIOUS_ACTIVITY, details, 'MEDIUM'),
  
  logRateLimitExceeded: (details) => 
    securityMonitor.logEvent(SECURITY_EVENTS.RATE_LIMIT_EXCEEDED, details, 'MEDIUM'),
  
  logInvalidInput: (details) => 
    securityMonitor.logEvent(SECURITY_EVENTS.INVALID_INPUT, details, 'LOW'),
  
  logAuthenticationFailure: (details) => 
    securityMonitor.logEvent(SECURITY_EVENTS.AUTHENTICATION_FAILURE, details, 'MEDIUM'),
  
  logCSRFAttempt: (details) => 
    securityMonitor.logEvent(SECURITY_EVENTS.CSRF_ATTEMPT, details, 'HIGH'),
  
  logXSSAttempt: (details) => 
    securityMonitor.logEvent(SECURITY_EVENTS.XSS_ATTEMPT, details, 'HIGH'),
  
  logSQLInjectionAttempt: (details) => 
    securityMonitor.logEvent(SECURITY_EVENTS.SQL_INJECTION_ATTEMPT, details, 'HIGH'),
  
  logSuspiciousUserAgent: (details) => 
    securityMonitor.logEvent(SECURITY_EVENTS.SUSPICIOUS_USER_AGENT, details, 'MEDIUM'),

  // Get security information
  getSecurityStats: () => securityMonitor.getSecurityStats(),
  getSecurityRecommendations: () => securityMonitor.getSecurityRecommendations(),
  isSuspiciousIP: (ip) => securityMonitor.isSuspiciousIP(ip),
  shouldBlockUser: (ip, userId) => securityMonitor.shouldBlockUser(ip, userId),
  
  // Custom event logging
  logCustomEvent: (eventType, details, severity = 'MEDIUM') => 
    securityMonitor.logEvent(eventType, details, severity)
};

// Export event types for use in other modules
export { SECURITY_EVENTS }; 