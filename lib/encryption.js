// lib/encryption.js
// Encryption utilities for sensitive data

import crypto from 'crypto';

// Generate encryption key from environment or create one
const getEncryptionKey = () => {
  const envKey = process.env.NEXT_PUBLIC_ENCRYPTION_KEY;
  if (envKey && envKey.length >= 32) {
    return envKey.substring(0, 32);
  }
  
  // In production, throw error if no encryption key is set
  if (process.env.NODE_ENV === 'production') {
    throw new Error('NEXT_PUBLIC_ENCRYPTION_KEY environment variable is required in production');
  }
  
  // Development fallback - generate a random key
  console.warn('⚠️  No encryption key found. Generating temporary key for development.');
  return crypto.randomBytes(32).toString('hex').substring(0, 32);
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
    console.error('Encryption error:', error);
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
    console.error('Decryption error:', error);
    return null;
  }
};

// Hash sensitive data (one-way)
export const hashData = (data, salt = null) => {
  try {
    if (!data) return null;
    
    const dataString = typeof data === 'string' ? data : JSON.stringify(data);
    const saltToUse = salt || crypto.randomBytes(16).toString('hex');
    
    const hash = crypto.createHash('sha256');
    hash.update(dataString + saltToUse);
    
    return {
      hash: hash.digest('hex'),
      salt: saltToUse
    };
  } catch (error) {
    console.error('Hashing error:', error);
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
    console.error('Hash verification error:', error);
    return false;
  }
};

// Secure random string generator
export const generateSecureToken = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

// Secure password hashing
export const hashPassword = (password) => {
  return hashData(password);
};

// Verify password
export const verifyPassword = (password, hash, salt) => {
  return verifyHash(password, hash, salt);
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