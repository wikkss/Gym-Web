// Shared helpers for the API. Pattern copied from the @neondatabase/serverless README:
// const sql = neon(process.env.DATABASE_URL); then await sql`...` tagged-template queries.
import { neon } from "@neondatabase/serverless";
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

// Created on first use, so a missing connection string becomes a clear JSON error instead of a crashed function.
const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
let client;
export const sql = (...a) => (client ||= neon(url))(...a);

const pad = n => String(n).padStart(3, "0");
export const code = u => (u.role === "staff" ? "ST-" : "GM-") + pad(u.id);
export const idOf = c => { const m = /^GM-(\d+)$/.exec(c || ""); return m ? +m[1] : null; };

export const hash = p => { const s = randomBytes(16).toString("hex"); return s + ":" + scryptSync(p, s, 32).toString("hex"); };
export const verify = (p, h) => {
  const [s, k] = (h || "").split(":");
  if (!s || !k) return false;
  const a = scryptSync(p, s, 32), b = Buffer.from(k, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
};

export const fail = (res, e) => {
  console.error(e);
  send(res, { err: url ? "Server error. Try again." : "The database is not connected yet. Add DATABASE_URL in Vercel and redeploy." }, 500);
};
export const body = req => typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
export const send = (res, data, status = 200) => {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(data));
};

// Shared sign-up and walk-in registration rules. Returns an error message or null.
export const check = f => {
  const name = (f.name || "").trim(), email = (f.email || "").trim().toLowerCase(), mobile = (f.mobile || "").trim();
  if (!name) return "Enter the full name.";
  if (!/^\S+@\S+\.\S+$/.test(email)) return "Enter a valid email address.";
  if (!/^\+?[\d\s-]{10,15}$/.test(mobile)) return "Enter a valid mobile number with 10 to 15 digits.";
  return null;
};

const COOKIE = /(?:^|;\s*)gl=([a-f0-9]+)/;
export const token = req => (COOKIE.exec(req.headers.cookie || "") || [])[1];
export const start = async (res, uid) => {
  const t = randomBytes(24).toString("hex");
  await sql`INSERT INTO sessions(token, user_id) VALUES(${t}, ${uid})`;
  res.setHeader("Set-Cookie", `gl=${t}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`);
};
export const who = async req => {
  const t = token(req);
  if (!t) return null;
  const [u] = await sql`SELECT u.id, u.name, u.email, u.mobile, u.role, u.plan, to_char(u.expires, 'YYYY-MM-DD') AS expires, u.suspended
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ${t} AND s.created_at > now() - interval '30 days' AND u.deleted_at IS NULL`;
  return u || null;
};
export const pub = u => ({ id: code(u), name: u.name, email: u.email, mobile: u.mobile, role: u.role, plan: u.plan, expires: u.expires, status: u.suspended ? "suspended" : "active", deleted: !!u.deleted });

// Creates the tables on the first request and seeds one staff account.
// Set STAFF_EMAIL and STAFF_PASSWORD in Vercel before the first request. The defaults are for testing only.
let ready;
export const init = () => ready || (ready = (async () => {
  await sql`CREATE TABLE IF NOT EXISTS users(id serial PRIMARY KEY, name text NOT NULL, email text UNIQUE NOT NULL, mobile text NOT NULL DEFAULT '', pass_hash text NOT NULL, role text NOT NULL DEFAULT 'member', plan text, expires date, suspended boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS visits(id serial PRIMARY KEY, user_id int REFERENCES users(id), tried text, in_at timestamptz NOT NULL DEFAULT now(), out_at timestamptz, ok boolean NOT NULL)`;
  await sql`CREATE TABLE IF NOT EXISTS sessions(token text PRIMARY KEY, user_id int NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now())`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at timestamptz`;
  await sql`CREATE TABLE IF NOT EXISTS member_log(id serial PRIMARY KEY, user_id int NOT NULL REFERENCES users(id), staff_name text NOT NULL, summary text NOT NULL, note text NOT NULL DEFAULT '', before jsonb NOT NULL, after jsonb NOT NULL, undone boolean NOT NULL DEFAULT false, at timestamptz NOT NULL DEFAULT now())`;
  const [s] = await sql`SELECT 1 AS x FROM users WHERE role = 'staff' LIMIT 1`;
  if (!s) await sql`INSERT INTO users(name, email, pass_hash, role) VALUES('Front Desk', ${process.env.STAFF_EMAIL || "staff@apatnatao.com"}, ${hash(process.env.STAFF_PASSWORD || "staff123")}, 'staff')`;
})().catch(e => { ready = null; throw e; }));
