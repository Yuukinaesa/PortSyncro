// lib/csrf.js
// CSRF (Cross-Site Request Forgery) protection utilities

import { generateSecureToken } from './encryption';

// CSRF token storage
const csrfTokens = new Map();

// Generate CSRF token
export const generateCSRFToken = (userId = null) => {
  const token = generateSecureToken(32);
  const timestamp = Date.now();
  
  // Store token with expiration (1 hour)
  csrfTokens.set(token, {
    userId,
    timestamp,
    expiresAt: timestamp + (60 * 60 * 1000) // 1 hour
  });
  
  // Clean up expired tokens
  cleanupExpiredTokens();
  
  return token;
};

// Validate CSRF token
export const validateCSRFToken = (token, userId = null) => {
  if (!token) return false;
  
  const tokenData = csrfTokens.get(token);
  if (!tokenData) return false;
  
  // Check if token is expired
  if (Date.now() > tokenData.expiresAt) {
    csrfTokens.delete(token);
    return false;
  }
  
  // Check user ID if provided
  if (userId && tokenData.userId && tokenData.userId !== userId) {
    return false;
  }
  
  return true;
};

// Clean up expired tokens
const cleanupExpiredTokens = () => {
  const now = Date.now();
  for (const [token, data] of csrfTokens.entries()) {
    if (now > data.expiresAt) {
      csrfTokens.delete(token);
    }
  }
};

// Get CSRF token for user
export const getCSRFToken = (userId = null) => {
  return generateCSRFToken(userId);
};

// Verify CSRF token and remove it (one-time use)
export const verifyAndConsumeCSRFToken = (token, userId = null) => {
  const isValid = validateCSRFToken(token, userId);
  if (isValid) {
    csrfTokens.delete(token);
  }
  return isValid;
};

// CSRF middleware for API routes - More flexible for development
export const csrfMiddleware = (handler) => {
  return async (req, res) => {
    // Skip CSRF check for GET requests
    if (req.method === 'GET') {
      return handler(req, res);
    }
    
    // Skip CSRF check in development mode for easier testing
    if (process.env.NODE_ENV === 'development') {
      return handler(req, res);
    }
    
    // Get CSRF token from headers or body
    const csrfToken = req.headers['x-csrf-token'] || req.body?.csrfToken;
    
    if (!csrfToken) {
      return res.status(403).json({
        error: 'CSRF_TOKEN_MISSING',
        message: 'CSRF token is required'
      });
    }
    
    // Validate CSRF token
    if (!validateCSRFToken(csrfToken)) {
      return res.status(403).json({
        error: 'CSRF_TOKEN_INVALID',
        message: 'Invalid or expired CSRF token'
      });
    }
    
    // Continue with the handler
    return handler(req, res);
  };
};

// Generate CSRF token for forms
export const generateFormCSRFToken = () => {
  return generateCSRFToken();
};

// Validate form CSRF token
export const validateFormCSRFToken = (token) => {
  return validateCSRFToken(token);
};

// CSRF token cleanup (run periodically)
export const cleanupCSRFTokens = () => {
  cleanupExpiredTokens();
};

// Get CSRF token statistics
export const getCSRFTokenStats = () => {
  cleanupExpiredTokens();
  return {
    activeTokens: csrfTokens.size,
    totalTokens: csrfTokens.size
  };
};

// Optional CSRF validation for development
export const optionalCSRFValidation = (req, res, next) => {
  // Only validate CSRF in production
  if (process.env.NODE_ENV === 'production') {
    const csrfToken = req.headers['x-csrf-token'] || req.body?.csrfToken;
    
    if (!csrfToken || !validateCSRFToken(csrfToken)) {
      return res.status(403).json({
        error: 'CSRF_TOKEN_INVALID',
        message: 'Invalid CSRF token'
      });
    }
  }
  
  return next();
}; 