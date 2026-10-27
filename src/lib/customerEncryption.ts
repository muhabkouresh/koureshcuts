import "server-only";
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Authenticated field encryption for the private server-side database client. */
export type CustomerDataContext = Readonly<{
  model: string;
  recordId: string;
  field: string;
}>;

export type CustomerEncryptionConfig = Readonly<{
  activeKeyId: string;
  /** Canonical base64 encoded, independently generated 32-byte keys. Keep retired keys for old backups. */
  keys: Readonly<Record<string, string>>;
  /** Independent 32-byte HMAC key. Changing it requires rebuilding all lookup indexes. */
  lookupKey: string;
}>;

const PREFIX = "kcenc";
const VERSION = "v1";
const KEY_ID = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ENVELOPE_LENGTH = Math.ceil(MAX_BYTES * 4 / 3) + 160;
const FAILURE = "Customer data cannot be decrypted.";

function decodeKey(value: unknown): Buffer {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(value)) {
    throw new Error("Customer encryption requires a canonical base64 32-byte key.");
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.length !== 32 || bytes.toString("base64") !== value) {
    throw new Error("Customer encryption requires a canonical base64 32-byte key.");
  }
  return bytes;
}

function contextBytes(context: CustomerDataContext, keyId: string): Buffer {
  if (!context || [context.model, context.recordId, context.field].some(
    (part) => typeof part !== "string" || part.length === 0 || part.length > 512,
  )) throw new Error("Customer encryption requires a model, record ID and field.");
  // JSON array prevents ambiguous concatenation. Authenticating the context prevents
  // moving a valid ciphertext to another field/customer. Key ID/version are bound too.
  return Buffer.from(JSON.stringify([PREFIX, VERSION, keyId, context.model, context.recordId, context.field]), "utf8");
}

function decodePart(value: string, expectedLength?: number): Buffer {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) throw new Error(FAILURE);
  const bytes = Buffer.from(value, "base64url");
  if (bytes.toString("base64url") !== value || (expectedLength !== undefined && bytes.length !== expectedLength)) {
    throw new Error(FAILURE);
  }
  return bytes;
}

export function createCustomerEncryption(config: CustomerEncryptionConfig) {
  if (!KEY_ID.test(config.activeKeyId)) throw new Error("Invalid customer encryption key ID.");
  const keys = new Map<string, Buffer>();
  for (const [id, encoded] of Object.entries(config.keys)) {
    if (!KEY_ID.test(id)) throw new Error("Invalid customer encryption key ID.");
    keys.set(id, decodeKey(encoded));
  }
  const activeKey = keys.get(config.activeKeyId);
  if (!activeKey) throw new Error("The active customer encryption key is missing.");
  const lookupKey = decodeKey(config.lookupKey);
  if ([...keys.values()].some((key) => timingSafeEqual(key, lookupKey))) {
    throw new Error("The customer lookup key must differ from the encryption keys.");
  }
  const activeId = config.activeKeyId;

  return Object.freeze({
    encrypt(value: string, context: CustomerDataContext): string {
      if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > MAX_BYTES) {
        throw new Error("Invalid customer data size.");
      }
      const aad = contextBytes(context, activeId);
      // Fresh random 96-bit nonce on every write. Never derive the nonce from PII.
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", activeKey, iv, { authTagLength: 16 });
      cipher.setAAD(aad);
      const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
      return [PREFIX, VERSION, activeId, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(":");
    },

    decrypt(envelope: string, context: CustomerDataContext): string {
      try {
        if (typeof envelope !== "string" || envelope.length > MAX_ENVELOPE_LENGTH) throw new Error(FAILURE);
        const parts = envelope.split(":");
        if (parts.length !== 6 || parts[0] !== PREFIX || parts[1] !== VERSION || !KEY_ID.test(parts[2])) throw new Error(FAILURE);
        const key = keys.get(parts[2]);
        if (!key) throw new Error(FAILURE);
        const iv = decodePart(parts[3], 12);
        const tag = decodePart(parts[4], 16);
        const ciphertext = decodePart(parts[5]);
        if (ciphertext.length > MAX_BYTES) throw new Error(FAILURE);
        const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
        decipher.setAAD(contextBytes(context, parts[2]));
        decipher.setAuthTag(tag);
        // Do not expose any decrypted bytes before final() authenticates the entire message.
        return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
      } catch {
        // No key, customer data, envelope or underlying exception in logs/errors.
        throw new Error(FAILURE);
      }
    },

    valueLookup(purpose: string, value: string): string {
      if (!/^[a-z-]{1,64}$/.test(purpose) || typeof value !== "string" || value.length > 4096) throw new Error("Invalid private lookup value.");
      return "kclookup:v1:" + createHmac("sha256", lookupKey)
        .update(JSON.stringify(["koureshcuts", purpose, "v1", value])).digest("hex");
    },

    emailLookup(email: string): string {
      if (typeof email !== "string" || email.length > 1024) throw new Error("Invalid customer lookup value.");
      // Matches the existing application's normalization. The same stable index is
      // used across appointment/waitlist/block/opt-out tables, separate from ciphertext.
      return "kclookup:v1:" + createHmac("sha256", lookupKey)
        .update(JSON.stringify(["koureshcuts", "customer-email", "v1", email.trim().toLowerCase()]))
        .digest("hex");
    },
  });
}

/** Lazy: builds/public pages never need a secret. Missing/invalid config always throws. */
export function customerEncryptionFromEnvironment(env: NodeJS.ProcessEnv = process.env) {
  try {
    if (!env.CUSTOMER_DATA_ACTIVE_KEY_ID || !env.CUSTOMER_DATA_KEYS || !env.CUSTOMER_DATA_LOOKUP_KEY) {
      throw new Error("Missing configuration.");
    }
    const keys: unknown = JSON.parse(env.CUSTOMER_DATA_KEYS);
    if (!keys || typeof keys !== "object" || Array.isArray(keys)) throw new Error("Invalid keyring.");
    return createCustomerEncryption({
      activeKeyId: env.CUSTOMER_DATA_ACTIVE_KEY_ID,
      keys: keys as Record<string, string>,
      lookupKey: env.CUSTOMER_DATA_LOOKUP_KEY,
    });
  } catch {
    throw new Error("Customer encryption configuration is missing or invalid.");
  }
}
