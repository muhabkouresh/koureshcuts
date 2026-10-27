# Private customer data

The application uses authenticated AES-256-GCM encryption for customer names,
email addresses, phone numbers, customer notes, waitlist/delay data, block/review
reasons, win-back/opt-out records, email retry payloads and push subscription
credentials. Optional administrative free text is encrypted too. Empty strings,
booking times, statuses, service/pricing data and anonymous statistics remain
readable to the database where needed for availability and reporting.

Encryption runs on the server. Automatic booking and reminder functions can
therefore continue. This protects a database copy without application keys; it
is not end-to-end encryption and does not prevent hosting-provider access,
compromised admin accounts or lawful disclosure. Existing email inboxes, calendar
exports, devices, provider logs and historical database backups are separate
copies; this change cannot retroactively encrypt them.

## Code and storage contract

- `customerEncryption.ts`: Node crypto, AES-256-GCM, independent random 96-bit
  nonces, full 128-bit tags and authenticated model/record-ID/field/version/key-ID
  context. Decryption never returns unauthenticated bytes or falls back on error.
- `customerPrivacy.ts`: private field registry and Prisma query adapter. Exact
  email and endpoint lookups use separate HMAC-SHA256 indexes. Email matching is
  normalized with trim/lowercase; endpoint matching remains case-sensitive.
- `prisma.ts`: the extended application client, including transaction clients.
  Private upserts handle legacy rows and concurrent inserts. Prisma errors retain
  retry codes while removing customer query arguments from error diagnostics.
- `privacyVersion=0` explicitly identifies legacy/migration rows. Version 1
  requires authenticated ciphertext for every nonempty private field and verifies
  lookup integrity on read. Reserved ciphertext prefixes never allow plaintext
  fallback after failed authentication. Selected helper columns are stripped from
  application results. Nested relation reads are decrypted; unsupported nested
  private writes, randomized-field filtering, ordering, grouping and bulk private
  edits are rejected rather than silently storing plaintext.
- Admin risk counts group decrypted email values within the authorized server.
  Broadcast recipients are deduplicated after decryption. Date/status queries and
  availability calculations stay database-side.

## Secret configuration

`CUSTOMER_DATA_ACTIVE_KEY_ID`, `CUSTOMER_DATA_KEYS` (JSON key ring), and
`CUSTOMER_DATA_LOOKUP_KEY` are private server configuration. The data and lookup
keys are independently generated random 32-byte values. Never derive them from
ADMIN_PASSWORD, SESSION_SECRET, database credentials or public configuration.
Never put them in NEXT_PUBLIC variables, next.config env, logs or source control.

Retain older data keys in the key ring for old records and backups. New writes
use the active key ID. Do not change the lookup key without a separate index
migration. Preview currently uses the existing shared production database, so
it must have the same decryption/lookup keys; a future isolated preview database
must use independent keys and fixture data.

An encrypted recovery copy is saved outside this repository as
`outputs/koureshcuts-datenschluessel.dpapi` in the Codex workspace. It is protected
with Windows DPAPI CurrentUser and entropy `koureshcuts-customer-data-v1`.
Recovery needs this Windows user profile; copying that file alone to another
computer is not sufficient. Provision an additional owner-managed recovery copy
in a password manager before replacing this Windows profile/device. No secret
key is included in source archives or the chat.

## Deployment target

The live custom-domain project is `koureshcuts_new`
(`prj_OiyuoVWmIsTJB2ZKMeTuWLHYmaKC`, team
`team_z6QVx7AtORRHIK17gjxGN6DV`). Its intended production branch is
`koureshcuts-live`. The older `koureshcuts` Vercel project has a different admin
credential and has not been validated/migrated as part of this rollout.
Do not merge/deploy this schema to that older project without its own verified
backup, key provisioning and database review.

## Operator rollout and recovery

`scripts/customer-privacy-maintenance.cjs` provides explicit operator-only
commands. It is never exposed as a public endpoint:

1. `backup`: consistent RepeatableRead snapshot, encrypted record envelopes and
   authenticated manifest. Uses KC_ENCRYPTED_BACKUP_PATH (absolute path, new file
   only). It immediately decrypts and validates the saved backup; no plaintext
   backup file is written.
2. `prepare-schema --apply-approved-migration`: additive columns/indexes only.
   Requires an existing verified encrypted backup. No DROP, delete or truncation.
3. Deploy the decrypt-capable application with verified private configuration.
   Verify the production branch/project/commit and actual live application before
   converting existing values. Older plaintext-only code cannot read converted
   records and must not be promoted as a rollback.
4. `migrate --apply-approved-migration`: checks normalized unique lookups, then
   converts legacy rows in bounded resumable batches. Record IDs and nonprivate
   values stay unchanged. Compare-and-set predicates protect concurrent edits.
5. `verify`: authenticates all private fields/indexes and requires zero legacy
   rows. `backup-check` verifies recovery contents without writing to a database.
6. Run the live read-only booking/admin/calendar checks and inspect actual stored
   values through aggregate-only verification. Save a post-migration encrypted
   backup separately; retain the pre-migration backup under the owner's policy.

For recovery, `readBackup` reconstructs typed rows (including DateTime values)
from authenticated envelopes. Restore into an isolated database first, then
validate keys, all relationships, counts and customer workflows before a
production switch. Do not blindly overwrite a live database. The local
integration suite covers backup round trips, tampered manifests, multi-page
migration, idempotence and count preservation.

## Tests

- `node --test scripts/customer-encryption.test.cjs scripts/regression.test.cjs`
- `customer-privacy.integration.test.cjs` uses an explicitly configured isolated
  PostgreSQL-compatible test database and requires a `kc_privacy_test_*` schema.
  The rollout was tested with local PGlite; no production test schema was created.
- TypeScript and ESLint checks. The pre-existing selftest warning is unrelated.

The Codex workspace verification report records actual deployment/migration
status. This source document describes the implementation and required process;
it does not independently certify that a particular deployment is active.
