# Supabase Audit and Cleanup Report

Date: 2026-07-16

Projects:

- Dev: `ekynewtwhgqideavmxnd`
- Prod: `gghrmzcynkrfczobuqmv`

Scope: Supabase database schema, migrations, RLS and grants, database functions, extensions, scheduled jobs, Edge Functions, Auth configuration, and the Canon code paths that access Supabase. Synchronization means schema and configuration parity; no Dev or Prod application rows were copied between projects.

## Baseline

The initial Dev audit found a healthy Postgres 17 database with 24 public tables, primary keys on every public table, RLS enabled throughout the public schema, organization-scoped policies, no recorded deadlocks, and a server-only Supabase client in Canon.

The cleanup items below are ordered by execution dependency, not merely severity.

## Cleanup items

### 1. Reconcile migration history

Status: Complete

The repository migration files and the hosted ledgers previously disagreed. Both ledgers were repaired with the official Supabase CLI workflow after runtime schema parity was proven.

Expected result:

- Local and remote migration history agree.
- A clean local database can be rebuilt from the repository.
- Dev and Prod record the same canonical migrations after synchronization.

Verification:

- The full 42-migration repository chain rebuilds successfully from a blank local database.
- `supabase migration list` shows the same local and remote timestamp on every row for Dev and Prod.
- Both hosted ledgers contain the same 42 versions and names, ending with `remove_unused_pg_cron`.

### 2. Keep the Supabase migration source in Git

Status: Accepted

The `supabase/` directory must remain in the GitHub repository. Git is the source of truth for reviewed migration SQL; the `supabase_migrations` schema in each hosted database is the applied-history ledger.

Minimum tracked structure:

```text
supabase/
  config.toml
  migrations/
    <timestamp>_<description>.sql
```

Optional tracked additions include database tests, safe local seed data, declarative schema files, and active Edge Function sources. Temporary link state, generated local state, credentials, and secrets must remain ignored.

Expected workflow:

1. Create a migration with the Supabase CLI.
2. Edit and test it locally.
3. Review and merge it through Git.
4. Apply the same committed migration to Dev and Prod.
5. Let Supabase record the applied version in its migration ledger.

Direct SQL or MCP experiments must be captured in a repository migration before they are considered complete.

### 3. Remove the obsolete scheduled job and Edge Function

Status: Complete in Dev and Prod

The initial audit found that the hourly `check-due-rules` job failed every run during the sampled seven-day window because it calls the missing `net` schema. Its Edge Function targets a legacy FastAPI endpoint that is no longer present in Canon. Current scheduled application work is owned by Inngest.

Expected result:

- The obsolete cron job is unscheduled.
- The obsolete Edge Function is removed.
- Inngest remains the only active owner of the replacement workflow.

Verification: both projects have zero Edge Functions. The obsolete job and its failed history were removed, and the now-unused `pg_cron` extension and `cron` schema were removed from both projects in a final non-cascading migration.

### 4. Remove or harden database functions

Status: Complete in Dev and Prod

Delete legacy repository, architecture-diagram, and schema-sampling functions. Retained functions must use a fixed `search_path`, fully qualified relations, and least-privilege execution grants. The active `match_knowledge_chunks` RPC must remain available to Canon's server-side Supabase client.

Verification: in both projects, the only Postgres-owned public function is `match_knowledge_chunks`; it is `SECURITY INVOKER`, has an empty fixed `search_path`, and is executable only by `service_role`. All six private Clerk-claim helpers also have fixed empty search paths and no `PUBLIC` or `anon` execution grant.

### 5. Align Auth and Data API access with backend-only Supabase

Status: Complete in Dev and Prod

Canon uses Clerk for authentication and organizations and uses Supabase from trusted server code. Remove obsolete Supabase Auth sessions and users, retire unused password-auth configuration, revoke unnecessary `anon` access, and limit Data API access to the roles Canon actually uses.

The server-only token table must remain deny-by-default for public roles.

Verification: both projects have zero Supabase Auth users and sessions, zero `anon` or `authenticated` public-table grants, service-role access retained, and the token table remains RLS-enabled with no browser policy. The local Supabase config disables native signups and the unused Clerk-to-Supabase third-party Auth bridge. The live Auth settings endpoints report project-wide signup disabled for Dev and Prod.

### 6. Improve relational indexes and constraints

Status: Complete in Dev and Prod

Add indexes for unindexed foreign keys, prioritizing organization and source relationships used by active Canon queries and cascades. Remove the duplicate non-unique `role_profiles(organization_id, role)` index while preserving its unique constraint. Make `knowledge_chunks.organization_id` and `knowledge_chunks.source_id` non-null after verifying existing data.

Verification: both advisors report no unindexed foreign keys; 16 missing relationship indexes were added, the duplicate role-profile index was removed, ownership columns are non-null, OAuth token-to-connection integrity is enforced, and orphan tokens are removed.

### 7. Move extensions out of the public schema

Status: Complete in Dev and Prod

Move `vector` to the `extensions` schema in a coordinated migration, then verify the HNSW index and the `match_knowledge_chunks` RPC.

Verification: pgvector is installed in `extensions` in both projects; the HNSW index remains valid and the active RPC smoke test passes as `service_role`. The unused `pg_cron` extension was removed from both projects.

Prod's platform upgrade moved pgvector to 0.8.2 while Dev's healthy platform build provides 0.8.0. This is a Supabase-managed binary patch difference: the vector type, index, RPC signature, grants, generated table/function shapes, and application behavior match.

### 8. Add generated database types and pin the client dependency

Status: Complete

Generate and commit Supabase TypeScript database types, parameterize the server client, add a repeatable type-generation check, and pin `@supabase/supabase-js` to the intended version while retaining the lockfile.

Implemented: Dev-generated database types are committed, the service client uses `Database`, `@supabase/supabase-js` is pinned to `2.86.2`, and `npm run supabase:types:check` proves the local public schema still matches the generated contract.

The typed client exposed and fixed a real stale query for the deleted `new_hires.name` column plus several nullable and JSON boundary mismatches. Dead code that silently queried seven already-removed legacy tracking tables was deleted.

## Current Dev verification

- Fresh `supabase db reset`: pass.
- Supabase security advisor: one intentional INFO (`oauth_provider_tokens` has RLS and no browser policy); no warnings or errors.
- Supabase performance advisor: no unindexed foreign keys; remaining notices are expected unused-index INFO immediately after index creation.
- Data preservation: Canon table row counts match the pre-cleanup baseline.
- Data API and `match_knowledge_chunks` service-role smoke test: pass.
- `npm run supabase:types:check`: pass.
- `npm run typecheck`: pass.
- `npm test`: 31 files and 89 tests pass.
- `npm run lint`: pass.
- `npm run build`: pass.

## Prod synchronization result

The canonical cleanup migrations were applied to Prod without copying Dev data. All Canon application-table row counts matched the immediate pre-migration snapshot. The only planned data removals were four obsolete Supabase Auth users and sessions and one orphaned OAuth provider token; all three categories now have zero orphan or legacy rows. A final non-cascading migration removed the unused `pg_cron` extension without changing application rows.

Final parity evidence:

- 24 application relations, 303 semantic columns, 118 constraints, 78 indexes, 92 RLS policies, seven application functions, and all table grants match between Dev and Prod.
- The generated TypeScript table, relationship, and function shapes match. Remote generators differ only in managed `__InternalSupabase.PostgrestVersion` metadata: Dev reports 13.0.5 and Prod reports 14.5.
- Both projects have zero Edge Functions and no Cron extension or schema.
- Both security advisors have only one intentional RLS INFO and no warning or error.
- Prod's performance advisor has only unused-index INFO notices and no missing foreign-key index.
- Prod's live Auth endpoint reports `disable_signup: true`.
- Prod is `ACTIVE_HEALTHY` on Postgres `17.6.1.147`; Dev is `ACTIVE_HEALTHY` on `17.6.1.052`.
- All 24 Prod application tables were recounted after the platform upgrade and Cron removal. No table lost rows; several increased while the live application remained in use.

## Schema organization recommendation

Keep the current application tables in `public` for now. The 24 tables form one organization-owned product model, and domain prefixes plus the server service layer already provide understandable boundaries. Moving `readiness`, `milestones`, and `onboarding` into separately exposed schemas would add operational cost without fixing a current collision or ownership problem.

A schema split would require coordinated changes to Supabase's exposed-schema configuration, grants, RLS policies, functions, generated types, migration SQL, and every code path that selects a non-default schema. It would also make cross-domain foreign keys and shared organization access rules harder to inspect.

Continue using `private` for security helpers and objects that must never be exposed through the Data API. Reconsider domain schemas only if a domain becomes an independently owned service, needs a meaningfully different API/grant boundary, or grows large enough that the operational separation pays for itself.

## Impact summary

| Improvement | Supabase effect | Canon codebase effect |
| --- | --- | --- |
| Canonical Git migrations | Hosted ledgers become deployment records rather than the only source of truth | Schema changes are reviewable, reproducible, and testable locally |
| Backend-only grants and Auth cleanup | Browser roles cannot query application tables; native signup is disabled | Canon continues using Clerk and the typed server-only service client |
| Function and extension hardening | Removes stale attack surface and mutable `search_path` behavior | The active vector-search RPC keeps the same application contract |
| Foreign-key indexes and constraints | Faster joins/cascades and enforced OAuth ownership | Stale nullable/JSON assumptions were fixed by generated types |
| Cron and Edge Function removal | Eliminates a permanently failing legacy workflow | Inngest remains the single scheduler and workflow owner |
| Keep domain tables in `public` | Avoids unnecessary exposed-schema and grant complexity | No `.schema(...)` migration or broad query rewrite is required |

## Completed platform and history work

### 1. Prod Postgres image upgraded

Prod was upgraded through Supabase's [managed upgrade workflow](https://supabase.com/docs/guides/platform/upgrading) from `17.4.1.069` to stable `17.6.1.147`. The project returned `ACTIVE_HEALTHY`, the security-patch warning disappeared, Auth configuration remained intact, and the schema, data, extensions, and active RPC were rechecked afterward.

The Dev-only `hypopg` and `index_advisor` installations are optional Supabase diagnostic extensions, not Canon runtime dependencies. The platform-managed pgvector and PostgREST patch versions differ, but the complete Canon schema and generated application contract match.

### 2. Remote migration ledgers repaired

The older Dev and Prod history entries were reconciled to the Git timestamps with the official [`supabase migration repair`](https://supabase.com/docs/reference/cli/supabase-migration-repair) workflow. Both projects now record the same 42 canonical migrations.

`supabase migration list` was run against both linked projects afterward and returned a one-to-one local/remote version match with no missing or remote-only rows.

## Completed execution gates

Dev passed all of the following before the canonical Prod migrations were applied:

- Security and performance advisors reviewed after cleanup.
- No unintended public `SECURITY DEFINER` functions.
- No retained mutable function search paths.
- No failing legacy cron job or obsolete Edge Function.
- RLS and grants match the backend-only access model.
- A clean local migration reset succeeds.
- Generated database types match Dev.
- Canon tests, typecheck, lint, and production build pass.
- The active `match_knowledge_chunks` application path is smoke-tested.

Prod synchronization preserved Prod application data and finished with the application schema, policies, functions, grants, Auth configuration, scheduler boundary, and canonical migration history matching the cleaned Dev target. Supabase-managed service and extension patch versions remain independently managed, but the Canon-facing database contract is identical and verified.
