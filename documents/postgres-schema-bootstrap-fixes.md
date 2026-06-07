# PostgreSQL Schema Bootstrap Fixes
## Purpose

This document records the changes required to make this repository recreate its database schema correctly on a plain PostgreSQL instance using the checked-in migration files.

This work was done to support local Docker PostgreSQL first, with the same migration chain intended to remain usable for:

- on-prem PostgreSQL
- managed PostgreSQL on GCP
- managed PostgreSQL on Azure
- Supabase-hosted Postgres through `DATABASE_URL`


## Original Problems

A fresh PostgreSQL bootstrap failed for four separate reasons.

### 1. Local environment mismatch

The local configuration was inconsistent:

- `.env.example` pointed to `young_minds`
- `docker/docker-compose-pg-local.yaml` created database `sharing_minds`
- `drizzle.config.ts` only loaded `.env.local`
- `lib/db/index.ts` only loaded `.env.local`

This meant local tooling could either target the wrong database or fall back to the wrong environment source.

### 2. Incomplete migration chain

The Drizzle migration journal in `lib/db/migrations/meta/_journal.json` referenced migrations that were missing from disk:

- `0015_kind_slyde.sql`
- `0026_useful_sunset_bain.sql`

Without those files, `drizzle-kit migrate` stopped before applying the full chain.

### 3. Historical type inconsistencies

The repo had a long-running mismatch around `users.id`.

Current runtime schema expects:

- `users.id` as `text`

But older migrations were built assuming:

- `users.id` as `uuid`

That caused invalid foreign key transitions during fresh bootstrap. Typical failures were:

- `auth_accounts.user_id` as `text` referencing `users.id` while `users.id` was still `uuid`
- `notifications.user_id` created as `uuid` while current schema expects `text`
- `gift_from_user_id` created as `uuid` while `users.id` is `text`

### 4. Detached later SQL migrations

These files existed in the repo but were not journaled by Drizzle:

- `0044_create_subscription_tables.sql`
- `0045_add_admin_session_tables.sql`
- `0046_add_cancelled_mentor_ids.sql`

As a result, `drizzle-kit migrate` completed successfully through `0028`, but subscription/admin-session/later-session changes were never applied.

## Files Changed

### Environment and bootstrap config

- `/.env.example`
- `/drizzle.config.ts`
- `/lib/db/index.ts`
- `/supabase_to_pg_migration.md`

### Current schema normalization

- `/lib/db/schema/mentees.ts`
- `/lib/db/schema/mentoring-relationships.ts`
- `/lib/db/schema/user-roles.ts`

### Migration repairs

- `/lib/db/migrations/0000_cultured_callisto.sql`
- `/lib/db/migrations/0002_abandoned_ozymandias.sql`
- `/lib/db/migrations/0003_talented_deadpool.sql`
- `/lib/db/migrations/0007_material_squadron_supreme.sql`
- `/lib/db/migrations/0009_panoramic_jocasta.sql`
- `/lib/db/migrations/0010_left_avengers.sql`
- `/lib/db/migrations/0011_messy_may_parker.sql`
- `/lib/db/migrations/0015_kind_slyde.sql`
- `/lib/db/migrations/0024_shallow_paibok.sql`
- `/lib/db/migrations/0025_fine_umar.sql`
- `/lib/db/migrations/0026_useful_sunset_bain.sql`
- `/lib/db/migrations/0027_long_steel_serpent.sql`
- `/lib/db/migrations/meta/_journal.json`

## Detailed Change Log

### A. Local Postgres configuration fixes

#### `.env.example`

Changed:

- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sharing_minds`
- `LOCAL_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sharing_minds`

Reason:

- align example config with the actual Docker database name

#### `drizzle.config.ts`

Added fallback loading of `.env` after `.env.local`.

Reason:

- allow Drizzle tooling to work in the current repo layout
- keep `.env.local` as the preferred local override

#### `lib/db/index.ts`

Added fallback loading of `.env` after `.env.local`.

Reason:

- match runtime DB initialization behavior with migration tooling

#### `supabase_to_pg_migration.md`

Updated:

- Docker command to use `docker/docker-compose-pg-local.yaml`
- local `DATABASE_URL` to `sharing_minds`
- phase notes to reflect that legacy schema changes must also be part of the tracked migration chain

## B. Current schema normalization

The current runtime schema was normalized to match the real user ID strategy already used by auth/runtime code.

### Canonical choice

- `users.id` remains `text`
- any column referencing `users.id` must also be `text`
- `roles.id` remains `uuid`
- `user_roles.role_id` must therefore remain `uuid`

### Specific schema fixes

#### `lib/db/schema/mentees.ts`

Changed:

- `userId` from `uuid` to `text`

#### `lib/db/schema/mentoring-relationships.ts`

Changed:

- `mentorId` from `uuid` to `text`
- `menteeId` from `uuid` to `text`

#### `lib/db/schema/user-roles.ts`

Changed:

- `roleId` from `text` to `uuid`

Reason:

- `roles.id` is still `uuid`

## C. Migration chain repairs

### 1. Initial schema alignment in `0000_cultured_callisto.sql`

Changed these columns from `uuid` to `text` at initial creation time:

- `users.id`
- `user_roles.user_id`
- `user_roles.assigned_by`
- `mentors.user_id`
- `mentees.user_id`
- `sessions.mentor_id`
- `sessions.mentee_id`
- `messages.sender_id`
- `messages.receiver_id`
- `mentoring_relationships.mentor_id`
- `mentoring_relationships.mentee_id`

Reason:

- avoid impossible or invalid mid-chain type transitions later
- make the initial schema reflect the current application identity model

### 2. Auth foreign key ordering fix

#### `0002_abandoned_ozymandias.sql`

Removed:

- `auth_accounts_user_id_users_id_fk`
- `auth_sessions_user_id_users_id_fk`

Reason:

- these FKs were added before `users.id` had been transitioned to the correct final type in the original history

#### `0003_talented_deadpool.sql`

Added the same auth FKs at the end of the migration.

Reason:

- ensure they are created after the relevant `users` and dependent user-referencing columns are in compatible form

### 3. Removed invalid `role_id` conversion

#### `0003_talented_deadpool.sql`

Removed:

- `ALTER TABLE "user_roles" ALTER COLUMN "role_id" SET DATA TYPE text`

Reason:

- `roles.id` remains `uuid`
- converting `user_roles.role_id` to `text` would make the schema internally inconsistent

### 4. Removed invalid mentor ID round-trip

#### `0003_talented_deadpool.sql`

Removed:

- `ALTER TABLE "mentors" ALTER COLUMN "id" SET DATA TYPE text`
- `ALTER TABLE "mentors" ALTER COLUMN "id" DROP DEFAULT`

Reason:

- `mentors.id` should remain `uuid`
- later migration `0008_bouncy_stick.sql` converted it back to `uuid`, which caused fresh bootstrap failures

### 5. Mentor content FK fix

#### `0007_material_squadron_supreme.sql`

Changed:

- `mentor_content.mentor_id` from `text` to `uuid`

Reason:

- `mentor_content.mentor_id` references `mentors.id`
- `mentors.id` is `uuid`

### 6. Course enrollment and wishlist fixes

#### `0009_panoramic_jocasta.sql`

Changed:

- `course_enrollments.gift_from_user_id` from `uuid` to `text`

Reason:

- `gift_from_user_id` references `users.id`, which is `text`

Also changed:

- removed `course_wishlist.id`

Reason:

- the table also had a composite primary key on `(course_id, mentee_id)`
- PostgreSQL does not allow both a separate primary key and a composite primary key

#### `0010_left_avengers.sql`

Removed:

- `ALTER TABLE "course_wishlist" DROP COLUMN "id"`

Reason:

- after fixing `0009`, the `id` column is never created

### 7. Notification user FK fix

#### `0011_messy_may_parker.sql`

Changed:

- `notifications.user_id` from `uuid` to `text`

Reason:

- `notifications.user_id` references `users.id`

### 8. Missing migration reconstruction

#### `0015_kind_slyde.sql`

Recreated with:

- review user reference type correction on `reviews.reviewer_id`
- review user reference type correction on `reviews.reviewee_id`

#### `0026_useful_sunset_bain.sql`

Recreated with the LiveKit schema that the journal expected:

- `livekit_rooms`
- `livekit_participants`
- `livekit_events`
- `livekit_recordings`
- related enums, indexes, function, and triggers

Reason:

- both files were referenced by the Drizzle journal but missing from disk

### 9. Session reschedule chain fixes

#### `0024_shallow_paibok.sql`

Changed:

- `DROP CONSTRAINT` to `DROP CONSTRAINT IF EXISTS`
- added `rescheduled_from` with `ADD COLUMN IF NOT EXISTS`

Reason:

- the migration assumed the FK and column already existed from out-of-band history
- fresh local bootstrap did not have that pre-existing state

#### `0025_fine_umar.sql`

Changed:

- `DROP CONSTRAINT` to `DROP CONSTRAINT IF EXISTS`

Reason:

- same idempotency issue as `0024`

### 10. Idempotent late cleanup

#### `0027_long_steel_serpent.sql`

Changed:

- `DROP TABLE "ai_chatbot_question_logs"` to `DROP TABLE IF EXISTS`

Reason:

- the table did not exist in a fresh bootstrap path

## D. Drizzle journal repair

### `lib/db/migrations/meta/_journal.json`

Added journal entries for:

- `0044_create_subscription_tables`
- `0045_add_admin_session_tables`
- `0046_add_cancelled_mentor_ids`

Reason:

- these SQL files existed but were not part of the tracked Drizzle migration chain
- without journal entries, `drizzle-kit migrate` never applied them

## E. Late schema additions now included

After journal repair, these changes are part of `db:migrate`:

### `0044_create_subscription_tables.sql`

Creates subscription-related schema including:

- `subscription_feature_categories`
- `subscription_features`
- `subscription_plans`
- `subscription_plan_features`
- `subscription_plan_prices`
- `subscriptions`
- `subscription_usage_tracking`
- `subscription_usage_events`
- `subscription_team_members`

### `0045_add_admin_session_tables.sql`

Creates:

- `admin_session_audit_trail`
- `admin_session_notes`

### `0046_add_cancelled_mentor_ids.sql`

Adds:

- `sessions.cancelled_mentor_ids`

## Verification Performed

The following were verified against local Docker PostgreSQL at:

- `postgresql://postgres:postgres@localhost:5432/sharing_minds`

### Migration verification

`drizzle-kit migrate` completed successfully after the fixes.

### Table verification

Confirmed existence of core tables including:

- `users`
- `mentors`
- `mentees`
- `sessions`
- `livekit_rooms`

Confirmed existence of subscription tables including:

- `subscription_feature_categories`
- `subscription_features`
- `subscription_plan_features`
- `subscription_plan_prices`
- `subscription_plans`
- `subscription_team_members`
- `subscription_usage_events`
- `subscription_usage_tracking`
- `subscriptions`

### Journal verification

Confirmed new Drizzle migration records were inserted for:

- `0044`
- `0045`
- `0046`

## Final Result

The repository can now bootstrap its schema into a plain PostgreSQL database using the tracked migration chain, including subscription tables and later admin/session changes.

This removes the previous dependency on:

- hidden Supabase-only schema state
- out-of-band table creation
- partially detached SQL files not registered in Drizzle

## Remaining Notes

- This document only covers schema/bootstrap correctness.
- It does not prove every runtime route is free of Supabase-specific query usage.
- Existing unrelated lint issues remain in the repo and were not part of this schema bootstrap work.

## Recommended Next Steps

1. Seed required baseline data such as roles and any subscription reference data.
2. Smoke-test auth, sessions, subscriptions, and admin session flows against local PostgreSQL.
3. Audit remaining runtime DB access to confirm all non-storage flows work through direct Postgres access and `DATABASE_URL`.
