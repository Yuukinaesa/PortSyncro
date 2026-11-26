// lib/firebaseAdmin.js
// High-Performance Firestore REST Client for Serverless & Telegram Bot Integration
// Replaces heavy, gRPC-hanging firebase-admin SDK with ultra-fast, zero-dependency REST client.
// Eliminates Vercel Top-Level Await 500 errors and gRPC connection timeout issues.

import crypto from 'crypto';
import { secureLogger } from './security.js';

// ═══════════════════════════════════════════════════════════════
// 1. TOKEN CACHE & SERVICE ACCOUNT AUTHENTICATION
// ═══════════════════════════════════════════════════════════════
let cachedAccessToken = null;
let tokenExpiresAt = 0;
let inFlightTokenPromise = null;

function getProjectId() {
  return (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || '').trim();
}

function sanitizePathSegments(pathStr) {
  if (typeof pathStr !== 'string' || !pathStr.trim()) {
    throw new Error('Invalid Firestore path: empty');
  }
  const segments = pathStr.replace(/^\/+|\/+$/g, '').split('/');
  for (const seg of segments) {
    if (!seg || seg === '.' || seg === '..' || /[?#&\s\\]/.test(seg)) {
      throw new Error(`Invalid Firestore path segment detected`);
    }
  }
  return segments;
}

function encodePath(pathStr) {
  return sanitizePathSegments(pathStr).map(seg => encodeURIComponent(seg)).join('/');
}

function getBaseUrl() {
  const projectId = encodeURIComponent(getProjectId());
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

function getRunQueryUrl(parentPath = null) {
  const projectId = encodeURIComponent(getProjectId());
  if (parentPath) {
    return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${encodePath(parentPath)}:runQuery`;
  }
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
}

async function fetchWithTransientRetry(url, options = {}, timeoutMs = 6000) {
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      if ((res.status === 429 || res.status >= 500) && attempt === 0) {
        await new Promise(r => setTimeout(r, 250));
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      if (attempt === 0) {
        await new Promise(r => setTimeout(r, 250));
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError || new Error('Firestore request failed');
}

export async function getServiceAccountToken() {
  // Return cached token if valid for at least 5 more minutes
  if (cachedAccessToken && Date.now() < (tokenExpiresAt - 5 * 60 * 1000)) {
    return cachedAccessToken;
  }

  // Deduplicate concurrent token fetches (prevents thundering herd in cron batches)
  if (inFlightTokenPromise) {
    return inFlightTokenPromise;
  }

  inFlightTokenPromise = (async () => {
    const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || '').trim();
    let privateKey = process.env.FIREBASE_PRIVATE_KEY || '';
    const projectId = getProjectId();

    if (!clientEmail || !privateKey || !projectId) {
      return null;
    }

    // Handle all key formats: JSON escaped, quotes, raw \n
    try {
      privateKey = JSON.parse(privateKey);
    } catch {
      if ((privateKey.startsWith('"') && privateKey.endsWith('"')) ||
          (privateKey.startsWith("'") && privateKey.endsWith("'"))) {
        privateKey = privateKey.slice(1, -1);
      }
    }
    privateKey = privateKey.replace(/\\n/g, '\n').trim();

    if (!privateKey.includes('-----BEGIN')) {
      secureLogger.error('[FirebaseAdmin] Invalid FIREBASE_PRIVATE_KEY format: missing PEM header');
      return null;
    }

    try {
      const now = Math.floor(Date.now() / 1000);
      const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({
        iss: clientEmail,
        sub: clientEmail,
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
        scope: 'https://www.googleapis.com/auth/datastore'
      })).toString('base64url');

      const signInput = `${header}.${payload}`;
      const signature = crypto.createSign('RSA-SHA256').update(signInput).sign(privateKey, 'base64url');
      const jwt = `${signInput}.${signature}`;

      const tokenRes = await fetchWithTransientRetry('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
      }, 8000);

      const tokenBody = await tokenRes.json();
      if (!tokenRes.ok) {
        secureLogger.error('[FirebaseAdmin] OAuth2 token exchange failed:', tokenBody);
        return null;
      }

      cachedAccessToken = tokenBody.access_token;
      tokenExpiresAt = Date.now() + ((tokenBody.expires_in || 3600) * 1000);
      return cachedAccessToken;
    } catch (error) {
      secureLogger.error('[FirebaseAdmin] Authentication failed:', error.message);
      return null;
    }
  })().finally(() => {
    inFlightTokenPromise = null;
  });

  return inFlightTokenPromise;
}

// ═══════════════════════════════════════════════════════════════
// 2. FIRESTORE FIELD VALUE CONVERTERS
// ═══════════════════════════════════════════════════════════════
export const FieldValue = {
  delete: () => ({ __type: 'delete' }),
  arrayUnion: (...values) => ({ __type: 'arrayUnion', values: values.flat() }),
  arrayRemove: (...values) => ({ __type: 'arrayRemove', values: values.flat() }),
  serverTimestamp: () => ({ __type: 'serverTimestamp' })
};

function toFirestoreValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'string') return { stringValue: val };
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return { integerValue: '0' };
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (typeof val === 'boolean') return { booleanValue: val };
  if (val instanceof Date) return { timestampValue: val.toISOString() };
  if (val?.__type === 'serverTimestamp') return { timestampValue: new Date().toISOString() };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(toFirestoreValue) } };
  }
  if (typeof val === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined && v?.__type !== 'delete') {
        fields[k] = toFirestoreValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function toFirestoreFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v?.__type !== 'delete') {
      fields[k] = toFirestoreValue(v);
    }
  }
  return fields;
}

function parseFirestoreValue(val) {
  if (!val || typeof val !== 'object') return null;
  if ('stringValue' in val) return val.stringValue;
  if ('integerValue' in val) return parseInt(val.integerValue, 10);
  if ('doubleValue' in val) return val.doubleValue;
  if ('booleanValue' in val) return val.booleanValue;
  if ('timestampValue' in val) return val.timestampValue;
  if ('nullValue' in val) return null;
  if ('mapValue' in val) {
    const res = {};
    for (const [k, v] of Object.entries(val.mapValue?.fields || {})) {
      res[k] = parseFirestoreValue(v);
    }
    return res;
  }
  if ('arrayValue' in val) {
    return (val.arrayValue?.values || []).map(parseFirestoreValue);
  }
  return null;
}

function parseFirestoreDoc(doc) {
  if (!doc) return null;
  const result = {};
  for (const [k, v] of Object.entries(doc.fields || {})) {
    result[k] = parseFirestoreValue(v);
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════
// 3. DOCUMENT REFERENCE
// ═══════════════════════════════════════════════════════════════
export class FirestoreDocument {
  constructor(path) {
    const segments = sanitizePathSegments(path);
    this.path = segments.join('/');
    this.encodedPath = segments.map(s => encodeURIComponent(s)).join('/');
    this.id = segments[segments.length - 1];
    this.ref = this;
  }

  collection(subCollectionName) {
    return new FirestoreCollection(`${this.path}/${subCollectionName}`);
  }

  async get() {
    const token = await getServiceAccountToken();
    if (!token) return { exists: false, id: this.id, ref: this, data: () => null };

    try {
      const res = await fetchWithTransientRetry(`${getBaseUrl()}/${this.encodedPath}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      }, 6000);

      if (res.status === 404) {
        return { exists: false, id: this.id, ref: this, data: () => null };
      }

      if (!res.ok) {
        throw new Error(`Firestore GET ${this.path} failed with status: ${res.status}`);
      }

      const body = await res.json();
      const parsed = parseFirestoreDoc(body);
      return {
        exists: true,
        id: this.id,
        ref: this,
        data: () => parsed
      };
    } catch (err) {
      secureLogger.error(`[FirebaseAdmin] GET ${this.path} error:`, err.message);
      throw err;
    }
  }

  async set(data, options = {}) {
    const token = await getServiceAccountToken();
    if (!token) throw new Error('Firestore not authenticated');

    const keys = Object.keys(data).filter(k => data[k] !== undefined);
    const params = options.merge
      ? (keys.length > 0 ? '?' + keys.map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&') : '')
      : '';

    const res = await fetchWithTransientRetry(`${getBaseUrl()}/${this.encodedPath}${params}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fields: toFirestoreFields(data) }),
    }, 6000);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Firestore SET ${this.path} failed: ${res.status} ${errText}`);
    }
    return { id: this.id, path: this.path };
  }

  async update(data) {
    const token = await getServiceAccountToken();
    if (!token) throw new Error('Firestore not authenticated');

    const deleteKeys = [];
    const arrayOperations = [];
    const normalUpdates = {};

    for (const [k, v] of Object.entries(data)) {
      if (v?.__type === 'delete') {
        deleteKeys.push(k);
      } else if (v?.__type === 'arrayUnion' || v?.__type === 'arrayRemove') {
        arrayOperations.push({ key: k, type: v.__type, values: v.values });
      } else if (v !== undefined) {
        normalUpdates[k] = v;
      }
    }

    if (arrayOperations.length > 0) {
      const current = await this.get();
      const currentData = current.exists ? (current.data() || {}) : {};
      for (const op of arrayOperations) {
        let arr = Array.isArray(currentData[op.key]) ? [...currentData[op.key]] : [];
        if (op.type === 'arrayUnion') {
          for (const item of op.values) {
            if (!arr.some(existing => JSON.stringify(existing) === JSON.stringify(item))) {
              arr.push(item);
            }
          }
        } else if (op.type === 'arrayRemove') {
          arr = arr.filter(existing => !op.values.some(item => JSON.stringify(existing) === JSON.stringify(item)));
        }
        normalUpdates[op.key] = arr;
      }
    }

    const allFieldPaths = [...Object.keys(normalUpdates), ...deleteKeys];
    if (allFieldPaths.length === 0) return { id: this.id };

    const queryParams = allFieldPaths.map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');

    const res = await fetchWithTransientRetry(`${getBaseUrl()}/${this.encodedPath}?${queryParams}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fields: toFirestoreFields(normalUpdates) }),
    }, 6000);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Firestore UPDATE ${this.path} failed: ${res.status} ${errText}`);
    }
    return { id: this.id };
  }

  async delete() {
    const token = await getServiceAccountToken();
    if (!token) return;

    const res = await fetchWithTransientRetry(`${getBaseUrl()}/${this.encodedPath}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    }, 6000);

    if (!res.ok && res.status !== 404) {
      const errText = await res.text();
      throw new Error(`Firestore DELETE ${this.path} failed: ${res.status} ${errText}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// 4. COLLECTION REFERENCE & QUERY
// ═══════════════════════════════════════════════════════════════
function mapOp(op) {
  if (op === '==') return 'EQUAL';
  if (op === '!=') return 'NOT_EQUAL';
  if (op === '<') return 'LESS_THAN';
  if (op === '<=') return 'LESS_THAN_OR_EQUAL';
  if (op === '>') return 'GREATER_THAN';
  if (op === '>=') return 'GREATER_THAN_OR_EQUAL';
  if (op === 'array-contains') return 'ARRAY_CONTAINS';
  if (op === 'in') return 'IN';
  if (op === 'not-in') return 'NOT_IN';
  return op;
}

export class FirestoreQuery {
  constructor(collectionPath, filters = [], orders = [], queryLimit = null) {
    const segments = sanitizePathSegments(collectionPath);
    this.path = segments.join('/');
    this.encodedPath = segments.map(s => encodeURIComponent(s)).join('/');
    this.filters = [...filters];
    this.orders = [...orders];
    this.queryLimit = queryLimit;
  }

  where(field, op, value) {
    return new FirestoreQuery(
      this.path,
      [...this.filters, { field, op, value }],
      this.orders,
      this.queryLimit
    );
  }

  orderBy(field, direction = 'asc') {
    return new FirestoreQuery(
      this.path,
      this.filters,
      [...this.orders, { field, direction: direction.toLowerCase() }],
      this.queryLimit
    );
  }

  limit(n) {
    return new FirestoreQuery(
      this.path,
      this.filters,
      this.orders,
      n
    );
  }

  async get() {
    const token = await getServiceAccountToken();
    if (!token) return { docs: [], empty: true, size: 0 };

    const parts = this.path.split('/');
    const collectionId = parts[parts.length - 1];
    const parentPath = parts.length > 1 ? parts.slice(0, parts.length - 1).join('/') : null;

    // If query has filters or order or limit, use :runQuery
    if (this.filters.length > 0 || this.orders.length > 0 || this.queryLimit !== null) {
      const structuredQuery = {
        from: [{ collectionId, allDescendants: false }]
      };

      if (this.filters.length === 1) {
        structuredQuery.where = {
          fieldFilter: {
            field: { fieldPath: this.filters[0].field },
            op: mapOp(this.filters[0].op),
            value: toFirestoreValue(this.filters[0].value)
          }
        };
      } else if (this.filters.length > 1) {
        structuredQuery.where = {
          compositeFilter: {
            op: 'AND',
            filters: this.filters.map(f => ({
              fieldFilter: {
                field: { fieldPath: f.field },
                op: mapOp(f.op),
                value: toFirestoreValue(f.value)
              }
            }))
          }
        };
      }

      if (this.orders.length > 0) {
        structuredQuery.orderBy = this.orders.map(o => ({
          field: { fieldPath: o.field },
          direction: o.direction === 'desc' ? 'DESCENDING' : 'ASCENDING'
        }));
      }

      if (this.queryLimit !== null) {
        structuredQuery.limit = this.queryLimit;
      }

      const runUrl = getRunQueryUrl(parentPath);

      try {
        const res = await fetchWithTransientRetry(runUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ structuredQuery }),
        }, 8000);

        if (res.ok) {
          const rows = await res.json();
          const docs = [];
          for (const item of rows) {
            if (item.document) {
              const docName = item.document.name || '';
              const docId = docName.split('/').pop();
              const parsed = parseFirestoreDoc(item.document);
              const ref = new FirestoreDocument(`${this.path}/${docId}`);
              docs.push({
                id: docId,
                exists: true,
                ref,
                data: () => parsed
              });
            }
          }
          return { docs, empty: docs.length === 0, size: docs.length };
        } else {
          secureLogger.warn(`[FirebaseAdmin] :runQuery failed with status ${res.status}. Falling back to paginated list.`);
        }
      } catch (e) {
        secureLogger.error(`[FirebaseAdmin] :runQuery error:`, e.message);
      }
    }

    // Default or Fallback: Paginated list of documents in collection
    try {
      const allRawDocs = [];
      let pageToken = null;
      let pageCount = 0;
      const MAX_PAGES = 20; // Safety guard: up to 6,000 docs

      do {
        const params = new URLSearchParams({ pageSize: '300' });
        if (pageToken) params.set('pageToken', pageToken);
        const listUrl = `${getBaseUrl()}/${this.encodedPath}?${params.toString()}`;

        const res = await fetchWithTransientRetry(listUrl, {
          headers: { 'Authorization': `Bearer ${token}` },
        }, 8000);

        if (res.status === 404 || !res.ok) {
          if (allRawDocs.length === 0) return { docs: [], empty: true, size: 0 };
          break;
        }

        const data = await res.json();
        if (Array.isArray(data.documents)) {
          allRawDocs.push(...data.documents);
        }
        pageToken = data.nextPageToken || null;
        pageCount++;
      } while (pageToken && pageCount < MAX_PAGES);

      let docs = allRawDocs.map(d => {
        const docId = (d.name || '').split('/').pop();
        const parsed = parseFirestoreDoc(d);
        const ref = new FirestoreDocument(`${this.path}/${docId}`);
        return {
          id: docId,
          exists: true,
          ref,
          data: () => parsed
        };
      });

      // Apply in-memory filters if fallback happened
      if (this.filters.length > 0) {
        docs = docs.filter(doc => {
          const d = doc.data() || {};
          return this.filters.every(f => {
            const val = d[f.field];
            if (f.op === '==') return val === f.value || String(val) === String(f.value);
            if (f.op === '!=') return val !== f.value;
            if (f.op === '>') return val > f.value;
            if (f.op === '>=') return val >= f.value;
            if (f.op === '<') return val < f.value;
            if (f.op === '<=') return val <= f.value;
            if (f.op === 'array-contains') {
              return Array.isArray(val) && val.some(x => x === f.value || String(x) === String(f.value));
            }
            return true;
          });
        });
      }

      // Apply in-memory ordering if needed
      if (this.orders.length > 0) {
        docs.sort((a, b) => {
          for (const o of this.orders) {
            const av = (a.data() || {})[o.field];
            const bv = (b.data() || {})[o.field];
            if (av === bv) continue;
            if (av === undefined || av === null) return o.direction === 'desc' ? 1 : -1;
            if (bv === undefined || bv === null) return o.direction === 'desc' ? -1 : 1;
            if (av < bv) return o.direction === 'desc' ? 1 : -1;
            if (av > bv) return o.direction === 'desc' ? -1 : 1;
          }
          return 0;
        });
      }

      if (this.queryLimit !== null) {
        docs = docs.slice(0, this.queryLimit);
      }

      return { docs, empty: docs.length === 0, size: docs.length };
    } catch (err) {
      secureLogger.error(`[FirebaseAdmin] List documents in ${this.path} failed:`, err.message);
      return { docs: [], empty: true, size: 0 };
    }
  }
}

export class FirestoreCollection extends FirestoreQuery {
  constructor(path) {
    super(path, [], [], null);
  }

  doc(docId) {
    const finalId = docId ? String(docId).trim() : generateFirestoreId();
    return new FirestoreDocument(`${this.path}/${finalId}`);
  }

  async add(data) {
    const docRef = this.doc();
    await docRef.set(data);
    return docRef;
  }
}

function generateFirestoreId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.randomBytes(20);
  let id = '';
  for (let i = 0; i < 20; i++) {
    id += chars[bytes[i] % chars.length];
  }
  return id;
}

// ═══════════════════════════════════════════════════════════════
// 5. FIRESTORE DATABASE CLIENT (adminDb)
// ═══════════════════════════════════════════════════════════════
class FirestoreDatabase {
  collection(path) {
    return new FirestoreCollection(path);
  }

  settings() {
    return this;
  }
}

const restFirestoreDb = new FirestoreDatabase();

export let adminDb = null;

export function getAdminDb() {
  const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || '').trim();
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').trim();
  const projectId = getProjectId();

  if (!clientEmail || !privateKey || !projectId) {
    adminDb = null;
    return null;
  }
  adminDb = restFirestoreDb;
  return restFirestoreDb;
}

// Initial evaluation
adminDb = getAdminDb();

export function getAdminAuth() {
  return {
    verifyIdToken: async (idToken) => {
      const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
      if (!apiKey) throw new Error('Missing NEXT_PUBLIC_FIREBASE_API_KEY');
      const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken })
      });
      if (!res.ok) throw new Error('Token verification failed');
      const data = await res.json();
      return data.users?.[0] ? { uid: data.users[0].localId, email: data.users[0].email } : null;
    }
  };
}

export const adminAuth = getAdminAuth();

export function initFirebaseAdmin() {
  const db = getAdminDb();
  return {
    app: db ? { name: '[DEFAULT]' } : null,
    adminDb: db,
    adminAuth: getAdminAuth()
  };
}

const adminCompat = {
  get app() { return { name: '[DEFAULT]' }; },
  get apps() { return getAdminDb() ? [{ name: '[DEFAULT]' }] : []; },
  firestore: Object.assign(() => getAdminDb(), { FieldValue }),
  auth: () => getAdminAuth()
};

export default adminCompat;
