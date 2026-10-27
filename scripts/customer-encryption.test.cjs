/* eslint-disable @typescript-eslint/no-require-imports -- Node test runner loads the isolated server-only TypeScript module. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const filename = path.join(root, 'src/lib/customerEncryption.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const loaded = { exports: {} };
new vm.Script(compiled, { filename }).runInNewContext({
  module: loaded, exports: loaded.exports, Buffer, process,
  require: id => { if (id === 'server-only') return {}; return require(id); },
});
const { createCustomerEncryption, customerEncryptionFromEnvironment } = loaded.exports;
const key = () => crypto.randomBytes(32).toString('base64');
const config = () => ({ activeKeyId: 'a', keys: { a: key() }, lookupKey: key() });
const context = { model: 'Appointment', recordId: 'test-record', field: 'customerEmail' };
const failure = /^Error: Customer data cannot be decrypted\.$/;

for (const [name, value] of [
  ['empty', ''], ['email', 'test@example.invalid'], ['Unicode', 'Ä Ö ß 💈 مرحبا'],
  ['newlines', 'line one\nline two\r\n'], ['null bytes', '\0x\0'], ['large', '🙂'.repeat(50_000)],
]) test('round trip: ' + name, () => {
  const enc = createCustomerEncryption(config());
  const encrypted = enc.encrypt(value, context);
  assert.equal(enc.decrypt(encrypted, context), value);
  assert.equal(encrypted.split(':').length, 6);
});

test('each write gets a different nonce and ciphertext', () => {
  const enc = createCustomerEncryption(config());
  const outputs = Array.from({ length: 1000 }, () => enc.encrypt('same email', context));
  assert.equal(new Set(outputs).size, 1000);
  assert.equal(new Set(outputs.map(x => x.split(':')[3])).size, 1000);
});

test('authenticated output can be decrypted independently with Node crypto', () => {
  const cfg = config(); const enc = createCustomerEncryption(cfg);
  const envelope = enc.encrypt('independent transport', context);
  const [prefix, version, id, nonce, tag, data] = envelope.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(cfg.keys[id], 'base64'), Buffer.from(nonce, 'base64url'), { authTagLength: 16 });
  decipher.setAAD(Buffer.from(JSON.stringify([prefix, version, id, context.model, context.recordId, context.field])));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  assert.equal(Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString(), 'independent transport');
});

test('record, model and field are authenticated', () => {
  const enc = createCustomerEncryption(config()); const encrypted = enc.encrypt('secret', context);
  for (const replacement of [{ recordId: 'another' }, { model: 'WaitlistEntry' }, { field: 'customerName' }]) {
    assert.throws(() => enc.decrypt(encrypted, { ...context, ...replacement }), failure);
  }
});

test('context delimiter collisions cannot move data between records', () => {
  const enc = createCustomerEncryption(config());
  const encrypted = enc.encrypt('secret', { model: 'A:B', recordId: 'C', field: 'D' });
  assert.throws(() => enc.decrypt(encrypted, { model: 'A', recordId: 'B:C', field: 'D' }), failure);
});

test('tampering with every envelope component fails with a generic error', () => {
  const enc = createCustomerEncryption(config()); const original = enc.encrypt('secret', context).split(':');
  for (let i = 0; i < original.length; i++) {
    const changed = [...original]; changed[i] = (changed[i][0] === 'A' ? 'B' : 'A') + changed[i].slice(1);
    assert.throws(() => enc.decrypt(changed.join(':'), context), failure);
  }
});

test('wrong key, missing key, missing tag and plaintext never pass through', () => {
  const cfg = config(); const enc = createCustomerEncryption(cfg); const encrypted = enc.encrypt('customer@example.invalid', context);
  assert.throws(() => createCustomerEncryption(config()).decrypt(encrypted, context), failure);
  for (const invalid of ['customer@example.invalid', encrypted.slice(0, -4), encrypted + ':extra', encrypted.replace(':a:', ':unknown:'), '']) {
    assert.throws(() => enc.decrypt(invalid, context), failure);
  }
});

test('rejects noncanonical encoding, wrong nonce/tag lengths and unsupported versions', () => {
  const enc = createCustomerEncryption(config()); const original = enc.encrypt('secret', context).split(':');
  for (const [i, value] of [[1, 'v2'], [3, ''], [3, original[3] + '='], [4, 'AAAA'], [5, '+///'], [2, '__proto__']]) {
    const changed = [...original]; changed[i] = value;
    assert.throws(() => enc.decrypt(changed.join(':'), context), failure);
  }
});

test('rotation writes with new key and reads old records while old key is retained', () => {
  const cfg = config(); const old = createCustomerEncryption(cfg).encrypt('before rotation', context);
  const rotated = createCustomerEncryption({ ...cfg, activeKeyId: 'b', keys: { ...cfg.keys, b: key() } });
  assert.equal(rotated.decrypt(old, context), 'before rotation');
  const fresh = rotated.encrypt('after rotation', context);
  assert.equal(fresh.split(':')[2], 'b');
  assert.equal(rotated.decrypt(fresh, context), 'after rotation');
  assert.throws(() => createCustomerEncryption(cfg).decrypt(fresh, context), failure);
});

test('lookup normalizes email, stays stable across encryption key rotation and conceals email', () => {
  const cfg = config(); const enc = createCustomerEncryption(cfg);
  const lookup = enc.emailLookup('  Test@Example.invalid ');
  assert.equal(lookup, enc.emailLookup('test@example.invalid'));
  assert.match(lookup, /^kclookup:v1:[0-9a-f]{64}$/);
  assert.equal(lookup.includes('example'), false);
  const rotated = createCustomerEncryption({ ...cfg, activeKeyId: 'b', keys: { ...cfg.keys, b: key() } });
  assert.equal(lookup, rotated.emailLookup('test@example.invalid'));
  assert.notEqual(lookup, createCustomerEncryption(config()).emailLookup('test@example.invalid'));
  assert.notEqual(enc.emailLookup(''), enc.emailLookup('test@example.invalid'));
});

test('lookup uses a separate HMAC with explicit purpose and version', () => {
  const cfg = config(); const enc = createCustomerEncryption(cfg);
  const expected = crypto.createHmac('sha256', Buffer.from(cfg.lookupKey, 'base64'))
    .update(JSON.stringify(['koureshcuts', 'customer-email', 'v1', 'user@example.invalid'])).digest('hex');
  assert.equal(enc.emailLookup('User@example.invalid'), 'kclookup:v1:' + expected);
  assert.throws(() => createCustomerEncryption({ ...cfg, lookupKey: cfg.keys.a }), /must differ/);
});

test('invalid keyring, weak lengths and missing active key are rejected', () => {
  const cfg = config();
  for (const changed of [
    { activeKeyId: '' }, { activeKeyId: 'a:b' }, { activeKeyId: 'missing' },
    { keys: { a: 'password' } }, { keys: { a: crypto.randomBytes(16).toString('base64') } },
    { keys: { a: key() + '\n' } }, { keys: { 'bad:id': key() } }, { lookupKey: 'password' },
  ]) assert.throws(() => createCustomerEncryption({ ...cfg, ...changed }));
});

test('environment setup never falls back to auth secrets and hides invalid configuration', () => {
  for (const env of [
    {}, { SESSION_SECRET: key() }, { CUSTOMER_DATA_ACTIVE_KEY_ID: 'a' },
    { CUSTOMER_DATA_ACTIVE_KEY_ID: 'a', CUSTOMER_DATA_KEYS: 'private invalid input', CUSTOMER_DATA_LOOKUP_KEY: key() },
    { CUSTOMER_DATA_ACTIVE_KEY_ID: 'a', CUSTOMER_DATA_KEYS: 'null', CUSTOMER_DATA_LOOKUP_KEY: key() },
    { CUSTOMER_DATA_ACTIVE_KEY_ID: 'a', CUSTOMER_DATA_KEYS: '[]', CUSTOMER_DATA_LOOKUP_KEY: key() },
  ]) assert.throws(() => customerEncryptionFromEnvironment(env), /^Error: Customer encryption configuration is missing or invalid\.$/);
  const cfg = config(); const enc = customerEncryptionFromEnvironment({ CUSTOMER_DATA_ACTIVE_KEY_ID: cfg.activeKeyId, CUSTOMER_DATA_KEYS: JSON.stringify(cfg.keys), CUSTOMER_DATA_LOOKUP_KEY: cfg.lookupKey });
  assert.equal(enc.decrypt(enc.encrypt('ok', context), context), 'ok');
});

test('limits payload/context sizes before encrypting or parsing', () => {
  const enc = createCustomerEncryption(config());
  assert.throws(() => enc.encrypt('a'.repeat(2 * 1024 * 1024 + 1), context), /size/);
  assert.throws(() => enc.decrypt('a'.repeat(3 * 1024 * 1024), context), failure);
  for (const invalid of [{ ...context, recordId: '' }, { ...context, field: 'x'.repeat(513) }]) {
    assert.throws(() => enc.encrypt('secret', invalid), /requires/);
  }
  assert.throws(() => enc.emailLookup('x'.repeat(1025)), /lookup/);
});

test('configuration is copied: caller mutation cannot change an existing cipher', () => {
  const cfg = config(); const enc = createCustomerEncryption(cfg); const ciphertext = enc.encrypt('data', context);
  cfg.keys.a = key(); cfg.lookupKey = key(); cfg.activeKeyId = 'b';
  assert.equal(enc.decrypt(ciphertext, context), 'data');
  assert.equal(enc.encrypt('data', context).split(':')[2], 'a');
});
