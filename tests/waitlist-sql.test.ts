import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';

test('waitlist migration enforces insert-only grants and RLS in embedded PostgreSQL', async () => {
  // No dataDir, sockets, Docker, service, credentials, or existing database.
  const db = new PGlite({ extensions: { citext } });
  try {
    await db.exec(`
      create extension citext;
      create role anon nologin noinherit nobypassrls;
      create role authenticated nologin noinherit nobypassrls;
      grant usage on schema public to anon, authenticated;
    `);
    // Execute the repository's actual schema/policy, not a reimplementation of it.
    await db.exec(readFileSync('supabase/migrations/20260710193742_waitlist_table.sql', 'utf8'));
    await db.exec(readFileSync('supabase/tests/waitlist.sql', 'utf8'));
    assert.equal((await db.query<{ count: number }>('select count(*)::int from public.waitlist')).rows[0].count, 0);
    const grants = await db.query<{ allowed: boolean }>("select has_table_privilege('anon', 'public.waitlist', 'SELECT') as allowed");
    assert.equal(grants.rows[0].allowed, false, 'temporary SELECT grant must roll back');
  } finally {
    await db.close();
  }
});
