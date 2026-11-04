import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

/**
 * A throwaway Postgres (PGlite, running inside the test) with the project's real migrations applied.
 * Only the Supabase pieces the migrations lean on are stubbed: the three API roles, auth.users and
 * auth.uid(), and the storage tables. Everything else (tables, constraints, functions) is the real thing.
 */
const STUBS = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb not null default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text, owner uuid);
  create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
  grant usage on schema auth, storage to anon, authenticated, service_role;
`;

export async function createDb() {
  const db = new PGlite();
  await db.exec(STUBS);
  const dir = "supabase/migrations";
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    try {
      await db.exec(readFileSync(`${dir}/${file}`, "utf8"));
    } catch (error) {
      throw new Error(`${file}: ${(error as Error).message}`);
    }
  }
  return db;
}

export type Db = Awaited<ReturnType<typeof createDb>>;
