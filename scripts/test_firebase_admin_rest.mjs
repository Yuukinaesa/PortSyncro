// scripts/test_firebase_admin_rest.mjs
// Automated verification for high-performance Firestore REST Client in lib/firebaseAdmin.js

import assert from 'assert';
import adminCompat, { getAdminDb, FieldValue, FirestoreDocument, FirestoreCollection, FirestoreQuery } from '../lib/firebaseAdmin.js';

console.log('🧪 RUNNING FIRESTORE REST CLIENT UNIT TESTS...\n');

// 1. Verify FieldValue Sentinels
{
  const del = FieldValue.delete();
  assert.strictEqual(del.__type, 'delete');

  const union = FieldValue.arrayUnion('group1', 'group2');
  assert.strictEqual(union.__type, 'arrayUnion');
  assert.deepStrictEqual(union.values, ['group1', 'group2']);

  const remove = FieldValue.arrayRemove('group1');
  assert.strictEqual(remove.__type, 'arrayRemove');
  assert.deepStrictEqual(remove.values, ['group1']);

  console.log('✅ 1. FieldValue sentinels verified.');
}

// 2. Verify Document & Subcollection Reference Chaining + Collection.add()
{
  const doc = new FirestoreDocument('users/test_uid_123');
  assert.strictEqual(doc.id, 'test_uid_123');
  assert.strictEqual(doc.path, 'users/test_uid_123');
  assert.strictEqual(doc.ref, doc);

  const subCol = doc.collection('transactions');
  assert.strictEqual(subCol.path, 'users/test_uid_123/transactions');
  assert.strictEqual(typeof subCol.add, 'function', 'FirestoreCollection must implement .add()');

  const subDoc = subCol.doc('tx_999');
  assert.strictEqual(subDoc.id, 'tx_999');
  assert.strictEqual(subDoc.path, 'users/test_uid_123/transactions/tx_999');

  const autoDoc = subCol.doc();
  assert(/^[A-Za-z0-9]{20}$/.test(autoDoc.id), 'Auto-generated Firestore ID must be 20 alphanumeric chars');

  // Verify Path Traversal Guard blocks '..', '?', '#', whitespace
  assert.throws(() => new FirestoreDocument('users/../secret'), /Invalid Firestore path/);
  assert.throws(() => subCol.doc('abc?admin=true'), /Invalid Firestore path/);
  assert.throws(() => subCol.doc('abc#frag'), /Invalid Firestore path/);

  console.log('✅ 2. Document, Subcollection, .add(), and Path Traversal defense verified.');
}

// 3. Verify Query Builder
{
  const col = new FirestoreCollection('users');
  const q = col.where('telegramChatId', '==', '12345678')
               .orderBy('createdAt', 'desc')
               .limit(5);

  assert.strictEqual(q.path, 'users');
  assert.strictEqual(q.filters.length, 1);
  assert.strictEqual(q.filters[0].field, 'telegramChatId');
  assert.strictEqual(q.filters[0].value, '12345678');
  assert.strictEqual(q.orders.length, 1);
  assert.strictEqual(q.orders[0].direction, 'desc');
  assert.strictEqual(q.queryLimit, 5);

  console.log('✅ 3. FirestoreQuery fluent chaining verified.');
}

// 4. Verify adminCompat interface
{
  assert(adminCompat.firestore, 'adminCompat.firestore must be defined');
  assert(adminCompat.auth, 'adminCompat.auth must be defined');
  assert(Array.isArray(adminCompat.apps), 'adminCompat.apps must be an array');
  assert.strictEqual(adminCompat.firestore.FieldValue, FieldValue);

  console.log('✅ 4. adminCompat legacy compatibility layer verified.');
}

console.log('\n🎉 ALL FIRESTORE REST TESTS PASSED 100%!');
