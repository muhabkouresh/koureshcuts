import "server-only";
import { randomUUID } from "node:crypto";
import { customerEncryptionFromEnvironment } from "./customerEncryption";

/* eslint-disable @typescript-eslint/no-explicit-any -- Dynamic Prisma query boundary; public client types remain unchanged. */
type Row = Record<string, any>;
type Spec = { fields: string[]; lookups: Record<string, { column: string; purpose: "email" | "endpoint" }> };
export const customerPrivacyModels: Record<string, Spec> = {
  Appointment: { fields: ["customerName", "customerEmail", "customerPhone", "notes"], lookups: { customerEmail: { column: "customerEmailHash", purpose: "email" } } },
  WaitlistEntry: { fields: ["customerName", "customerEmail"], lookups: { customerEmail: { column: "customerEmailHash", purpose: "email" } } },
  DelayLog: { fields: ["customerName", "customerEmail", "note"], lookups: { customerEmail: { column: "customerEmailHash", purpose: "email" } } },
  BlockedCustomer: { fields: ["email", "reason"], lookups: { email: { column: "emailHash", purpose: "email" } } },
  ReviewCustomer: { fields: ["email", "reason"], lookups: { email: { column: "emailHash", purpose: "email" } } },
  EmailOptOut: { fields: ["email"], lookups: { email: { column: "emailHash", purpose: "email" } } },
  WinbackLog: { fields: ["email"], lookups: { email: { column: "emailHash", purpose: "email" } } },
  EmailFailure: { fields: ["to", "subject", "html", "error"], lookups: {} },
  CustomerPush: { fields: ["endpoint", "p256dh", "auth", "email"], lookups: { email: { column: "emailHash", purpose: "email" }, endpoint: { column: "endpointHash", purpose: "endpoint" } } },
  PushSubscription: { fields: ["endpoint", "p256dh", "auth"], lookups: { endpoint: { column: "endpointHash", purpose: "endpoint" } } },
  ProductSale: { fields: ["note"], lookups: {} },
  TimeOff: { fields: ["reason"], lookups: {} },
  SpecialDay: { fields: ["note"], lookups: {} },
};
const relations: Record<string, Record<string, string>> = { Service: { appointments: "Appointment", waitlist: "WaitlistEntry" }, Appointment: { service: "Service" }, WaitlistEntry: { service: "Service" } };
export type CustomerCrypto = ReturnType<typeof customerEncryptionFromEnvironment>;
let cached: CustomerCrypto | undefined;
export function customerCrypto(): CustomerCrypto { return cached ??= customerEncryptionFromEnvironment(); }
export function privacyLookup(crypto: CustomerCrypto, purpose: "email" | "endpoint", value: string): string {
  return purpose === "email" ? crypto.emailLookup(value) : crypto.valueLookup("push-endpoint", value);
}
function clone<T>(value: T): T {
  if (Array.isArray(value)) return value.map(clone) as T;
  if (value && Object.prototype.toString.call(value) === "[object Object]") return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, clone(v)])) as T;
  return value;
}
function protectedFilter(filter: any, lookup: (value: string) => string): any {
  if (typeof filter === "string") return lookup(filter);
  if (!filter || typeof filter !== "object" || Array.isArray(filter)) throw new Error("Unsupported private-field filter.");
  const result: Row = {};
  for (const [operator, value] of Object.entries(filter)) {
    if (operator === "mode") { if (value !== "insensitive" && value !== "default") throw new Error("Unsupported private-field filter."); continue; }
    if (operator === "equals" && typeof value === "string") result.equals = lookup(value);
    else if ((operator === "in" || operator === "notIn") && Array.isArray(value) && value.every(v => typeof v === "string")) result[operator] = value.map(lookup);
    else if (operator === "not") result.not = protectedFilter(value, lookup);
    else throw new Error("Unsupported private-field filter.");
  }
  return result;
}
function rewriteWhere(model: string, where: Row | undefined, crypto: () => CustomerCrypto): Row | undefined {
  if (!where) return where;
  const spec = customerPrivacyModels[model]; const result: Row = {}; const conditions: Row[] = [];
  for (const [field, value] of Object.entries(where)) {
    if (["AND", "OR", "NOT"].includes(field)) {
      result[field] = Array.isArray(value) ? value.map(v => rewriteWhere(model, v, crypto)) : rewriteWhere(model, value, crypto);
    } else if (spec?.lookups[field]) {
      const lookup = spec.lookups[field];
      if (lookup.purpose === "endpoint" && value?.mode === "insensitive") throw new Error("Push endpoints require exact matching.");
      const encoded = protectedFilter(value, v => privacyLookup(crypto(), lookup.purpose, v));
      // Legacy rows are explicit version 0 and have no lookup index. Never fall
      // back to plaintext after decryption/authentication has failed.
      const condition = { OR: [{ [lookup.column]: encoded }, { privacyVersion: 0, [lookup.column]: null, [field]: value }] };
      conditions.push(condition);
    } else if (spec?.fields.includes(field)) {
      throw new Error("Filtering randomized private fields is unsupported.");
    } else if (relations[model]?.[field] && value && typeof value === "object") {
      const related = relations[model][field]; const rewritten: Row = {};
      for (const [operator, nested] of Object.entries(value)) rewritten[operator] = rewriteWhere(related, nested as Row, crypto);
      result[field] = rewritten;
    } else result[field] = value;
  }
  if (conditions.length) result.AND = [...(result.AND ? Array.isArray(result.AND) ? result.AND : [result.AND] : []), ...conditions];
  return result;
}
function rejectPrivateOrder(model: string, order: any) {
  for (const part of Array.isArray(order) ? order : order ? [order] : []) {
    for (const field of Object.keys(part)) if (customerPrivacyModels[model]?.fields.includes(field)) throw new Error("Ordering randomized private fields is unsupported.");
  }
}
function planSelection(model: string, args: Row, crypto: () => CustomerCrypto): void {
  const spec = customerPrivacyModels[model];
  if (args.omit && spec) throw new Error("Private data requires explicit select instead of omit.");
  if (args.select && spec && spec.fields.some(field => args.select[field])) {
    args.select.id = true; args.select.privacyVersion = true;
    for (const [field, lookup] of Object.entries(spec.lookups)) if (args.select[field]) args.select[lookup.column] = true;
  }
  for (const [field, related] of Object.entries(relations[model] ?? {})) {
    const selection = args.select?.[field] ?? args.include?.[field];
    if (selection && typeof selection === "object") {
      selection.where = rewriteWhere(related, selection.where, crypto);
      rejectPrivateOrder(related, selection.orderBy);
      planSelection(related, selection, crypto);
    }
  }
}
function restoreSelection(model: string, result: any, original: Row, crypto: () => CustomerCrypto): any {
  if (result == null || typeof result !== "object") return result;
  if (Array.isArray(result)) return result.map(row => restoreSelection(model, row, original, crypto));
  const row = { ...result }; const spec = customerPrivacyModels[model];
  if (spec) {
    const version = row.privacyVersion ?? 0;
    if (version !== 0 && version !== 1) throw new Error("Unsupported customer privacy version.");
    for (const field of spec.fields) {
      if (typeof row[field] !== "string") continue;
      if (row[field].startsWith("kcenc:")) {
        row[field] = crypto().decrypt(row[field], { model, recordId: row.id, field });
      } else if (version === 1 && row[field] !== "") throw new Error("Customer data authentication failed.");
      const lookup = spec.lookups[field];
      if (lookup && row[lookup.column] != null && row[lookup.column] !== privacyLookup(crypto(), lookup.purpose, row[field])) throw new Error("Customer lookup authentication failed.");
    }
    delete row.privacyVersion;
    for (const lookup of Object.values(spec.lookups)) delete row[lookup.column];
    if (original.select && !original.select.id) delete row.id;
  }
  for (const [field, related] of Object.entries(relations[model] ?? {})) {
    if (row[field] == null) continue;
    const selection = original.select?.[field] ?? original.include?.[field];
    row[field] = restoreSelection(related, row[field], typeof selection === "object" ? selection : {}, crypto);
  }
  return row;
}
export function encryptCustomerWrite(model: string, input: Row, crypto: CustomerCrypto, recordId?: string, creating = false): Row {
  const spec = customerPrivacyModels[model]; if (!spec) return input;
  const data = clone(input);
  if (!creating && data.id !== undefined) throw new Error("Private record IDs are immutable.");
  const id = creating ? data.id ?? randomUUID() : recordId;
  if (creating) { data.id = id; data.privacyVersion = 1; }
  if (data.privacyVersion !== undefined && !creating) throw new Error("Privacy version is managed internally.");
  for (const [field, related] of Object.entries(relations[model] ?? {})) if (data[field] && customerPrivacyModels[related]) throw new Error("Nested private writes are unsupported.");
  for (const field of spec.fields) {
    if (data[field] === undefined) {
      // Defaults are public empty strings. Their lookup still needs to be present.
      if (creating && spec.lookups[field]) data[spec.lookups[field].column] = privacyLookup(crypto, spec.lookups[field].purpose, "");
      continue;
    }
    const value = typeof data[field] === "string" ? data[field] : data[field]?.set;
    if (typeof value !== "string" || !id) throw new Error("Private writes require a stable record ID and string value.");
    const lookup = spec.lookups[field];
    if (lookup) data[lookup.column] = privacyLookup(crypto, lookup.purpose, value);
    data[field] = value === "" ? "" : crypto.encrypt(value, { model, recordId: id, field });
  }
  return data;
}

/** Pure query adapter used by Prisma extensions and integration tests. */
export async function customerPrivacyQuery(model: string, operation: string, input: Row, query: (args: Row) => Promise<any>, crypto: () => CustomerCrypto = customerCrypto) {
  const original = clone(input); const args = clone(input); const spec = customerPrivacyModels[model];
  // Reject direct manipulation of internal integrity/lookup columns from app code.
  for (const target of [args.data, args.create, args.update]) if (target && !Array.isArray(target) && spec) {
    if (["privacyVersion", ...Object.values(spec.lookups).map(l => l.column)].some(field => field in target)) throw new Error("Private metadata is managed internally.");
  }
  if (spec && operation === "upsert") throw new Error("Use privateUpsert for legacy-safe private upserts.");
  if (spec && ["findUnique", "findUniqueOrThrow", "update", "delete"].includes(operation)) {
    // Every single-row operation uses a stable ID. Lookup queries use findFirst,
    // and endpoint deletes use deleteMany so both encrypted and legacy rows match.
    if (!args.where?.id && Object.keys(spec.lookups).some(field => field in (args.where ?? {}))) throw new Error("Private lookups require findFirst/deleteMany.");
  }
  args.where = rewriteWhere(model, args.where, crypto);
  rejectPrivateOrder(model, args.orderBy);
  if (spec) {
    if (args.by?.some((field: string) => spec.fields.includes(field))) throw new Error("Group private data by lookup index.");
    if (args.distinct && (Array.isArray(args.distinct) ? args.distinct : [args.distinct]).some((field: string) => spec.fields.includes(field))) throw new Error("Deduplicate decrypted private data in the authorized application.");
    if (operation === "create") args.data = encryptCustomerWrite(model, args.data, crypto(), undefined, true);
    else if (operation === "createMany" || operation === "createManyAndReturn") args.data = (Array.isArray(args.data) ? args.data : [args.data]).map((data: Row) => encryptCustomerWrite(model, data, crypto(), undefined, true));
    else if (operation === "update") args.data = encryptCustomerWrite(model, args.data, crypto(), args.where?.id);
    else if ((operation === "updateMany" || operation === "updateManyAndReturn") && spec.fields.some(field => field in args.data)) throw new Error("Bulk private-field updates require per-record encryption.");
  }
  // Block unsupported nested writes even when the root model itself is public.
  for (const [field, related] of Object.entries(relations[model] ?? {})) if (customerPrivacyModels[related] && args.data?.[field]) throw new Error("Nested private writes are unsupported.");
  if (["count", "aggregate", "groupBy", "updateMany", "createMany", "deleteMany"].includes(operation)) return query(args);
  planSelection(model, args, crypto);
  return restoreSelection(model, await query(args), original, crypto);
}
