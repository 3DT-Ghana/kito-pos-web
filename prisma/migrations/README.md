# Migration conventions

**Every migration in this directory must be idempotent.**

Use `IF NOT EXISTS` on `CREATE TABLE`, `CREATE INDEX`, `CREATE UNIQUE INDEX` and
`ADD COLUMN`. Postgres has no `IF NOT EXISTS` for `CREATE TYPE` or
`ADD CONSTRAINT`, so guard those with a `DO $$ … $$` block — see
`20260802120000_add_waybills_payment_details_and_whatsapp` for both patterns.

## Why

Upstream (`3DT-Ghana/kito-pos-web`) develops with `prisma db push`, which applies
`schema.prisma` directly and records nothing in `_prisma_migrations`. Two
consequences follow, and both have already broken a production deploy:

1. **Schema changes arrive without a migration.** The waybills tables, the
   bank/MoMo payment columns and the WhatsApp tenant settings were all declared
   in `schema.prisma`, with app code shipping against them, and no migration ever
   created them.
2. **Databases touched by `db push` already contain objects that later migrations
   try to create.** An unguarded statement then fails with `42P07`
   (relation exists) or `42701` (column exists), and `migrate deploy` halts.

Guarding every statement makes `migrate deploy` converge on both kinds of
database — one built purely from migrations, and one that `db push` has run
against — without weakening anything. A guarded migration still creates the
object when it is genuinely absent.

## After every upstream merge

Check for schema changes that arrived without a migration:

```bash
npx prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma
```

Run this against a database with all migrations applied. If it reports anything,
that is a missing migration. Generate it with the same command plus `--script`,
save it under a new timestamped directory, then add the guards.

## Recovering a failed migration

`migrate deploy` refuses to continue while a failed attempt is recorded
(`P3009`). Clear it with Prisma rather than raw SQL:

```bash
npx prisma migrate resolve --rolled-back <migration_name>
```

Then redeploy. Use `--applied` instead when the objects already exist and the
migration should simply be marked done.

## Testing locally

A throwaway Postgres is enough to test both paths:

```bash
initdb -D /tmp/pg -U postgres --auth=trust --locale=C   # needs LC_ALL=C LANG=C
pg_ctl -D /tmp/pg -o "-p 55432" -l /tmp/pg.log start
```

Test **from scratch** (`migrate deploy` on an empty database) *and* **on a
`db push` database** (`prisma db push`, then `migrate deploy`). Both must finish
with `migrate diff` reporting no difference.
