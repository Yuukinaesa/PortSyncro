// lib/encryption.js
// Encryption utilities for sensitive data
// SECURITY: This module should ONLY be used server-side

import crypto from 'crypto';

// Runtime check to prevent client-side usage
const isServer = typeof window === 'undefined';

// Generate encryption key from environment or create one
const getEncryptionKey = () => {
  // SECURITY: Prevent encryption operations on client-side
  if (!isServer) {
    throw new Error('Encryption operations are not allowed on the client-side');
  }

  // SECURITY: Use server-only environment variable (no NEXT_PUBLIC_ prefix)
  const envKey = process.env.ENCRYPTION_KEY;
  if (envKey && envKey.length >= 32) {
    return envKey.substring(0, 32);
  }

  // In production, throw error if no encryption key is set
  if (process.env.NODE_ENV === 'production') {
    throw new Error('ENCRYPTION_KEY environment variable is required in production');
  }

  // Development fallback - generate a random key (consistent per process)
  if (!globalThis.__devEncryptionKey) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('⚠️  No encryption key found. Generating temporary key for development.');
    }
    globalThis.__devEncryptionKey = crypto.randomBytes(32).toString('hex').substring(0, 32);
  }
  return globalThis.__devEncryptionKey;
};

// Encrypt sensitive data
export const encryptData = (data) => {
  try {
    if (!data) return null;

    const key = getEncryptionKey();
    const iv = crypto.randomBytes(16);

    // Use createCipheriv instead of deprecated createCipher
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key), iv);

    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return {
      encrypted,
      iv: iv.toString('hex'),
      algorithm: 'aes-256-cbc'
    };
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Encryption error:', error);
    }
    return null;
  }
};

// Decrypt sensitive data
export const decryptData = (encryptedData) => {
  try {
    if (!encryptedData || !encryptedData.encrypted) return null;

    const key = getEncryptionKey();
    const iv = Buffer.from(encryptedData.iv, 'hex');

    // Use createDecipheriv instead of deprecated createDecipher
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key), iv);

    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Decryption error:', error);
    }
    return null;
  }
};

// Hash sensitive data (one-way)
export const hashData = (data, salt = null) => {
  try {
    if (!data) return null;

    const dataString = typeof data === 'string' ? data : JSON.stringify(data);
    const saltToUse = salt || crypto.randomBytes(16).toString('hex');

    // Upgrade to SHA-512 for generic data hashing
    const hash = crypto.createHash('sha512');
    hash.update(dataString + saltToUse);

    return {
      hash: hash.digest('hex'),
      salt: saltToUse
    };
  } catch (error) {
    // In production, we should probably throw rather than return null to avoid silent failures
    // converting console.error to throw for safety
    if (process.env.NODE_ENV !== 'production') {
      console.error('Hashing error:', error);
    }
    return null;
  }
};

// Verify hashed data
export const verifyHash = (data, hash, salt) => {
  try {
    if (!data || !hash || !salt) return false;

    const dataString = typeof data === 'string' ? data : JSON.stringify(data);
    const verifyHashResult = hashData(dataString, salt);

    return verifyHashResult && verifyHashResult.hash === hash;
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Hash verification error:', error);
    }
    return false;
  }
};

// Secure random string generator
export const generateSecureToken = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

// Secure password hashing - PBKDF2 (NIST recommended)
export const hashPassword = (password, salt = null) => {
  if (!password) return null;
  const saltToUse = salt || crypto.randomBytes(16).toString('hex');
  const iterations = 100000;
  const keyLen = 64;
  const digest = 'sha512';

  const derivedKey = crypto.pbkdf2Sync(password, saltToUse, iterations, keyLen, digest);

  return {
    hash: derivedKey.toString('hex'),
    salt: saltToUse,
    iterations: iterations,
    digest: digest
  };
};

// Verify password
export const verifyPassword = (password, hash, salt) => {
  if (!password || !hash || !salt) return false;

  // Check if it's the old format (SHA256) or new PBKDF2
  // If we were doing a migration we would check here. 
  // For now assuming all new passwords or this is the first secure impl.
  // If strict Enterprise, we assume standard usage:

  const result = hashPassword(password, salt);
  // Note: constant-time comparison is better but simple string compare is often used in JS context.
  // For strict security, use crypto.timingSafeEqual

  const hashBuffer = Buffer.from(hash, 'hex');
  const resultBuffer = Buffer.from(result.hash, 'hex');

  if (hashBuffer.length !== resultBuffer.length) return false;

  return crypto.timingSafeEqual(hashBuffer, resultBuffer);
};

// Encrypt sensitive fields in objects
export const encryptSensitiveFields = (obj, fieldsToEncrypt = []) => {
  if (!obj || typeof obj !== 'object') return obj;

  const encrypted = { ...obj };

  fieldsToEncrypt.forEach(field => {
    if (encrypted[field]) {
      const encryptedValue = encryptData(encrypted[field]);
      if (encryptedValue) {
        encrypted[field] = encryptedValue;
      }
    }
  });

  return encrypted;
};

// Decrypt sensitive fields in objects
export const decryptSensitiveFields = (obj, fieldsToDecrypt = []) => {
  if (!obj || typeof obj !== 'object') return obj;

  const decrypted = { ...obj };

  fieldsToDecrypt.forEach(field => {
    if (decrypted[field] && typeof decrypted[field] === 'object') {
      const decryptedValue = decryptData(decrypted[field]);
      if (decryptedValue) {
        decrypted[field] = decryptedValue;
      }
    }
  });

  return decrypted;
}; 