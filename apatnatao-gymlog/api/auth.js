import { sql, init, fail, hash, verify, body, send, check, start, token } from "../lib/db.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return send(res, { err: "Use POST." }, 405);
    await init();
    const b = body(req);

    if (b.action === "logout") {
      const t = token(req);
      if (t) await sql`DELETE FROM sessions WHERE token = ${t}`;
      res.setHeader("Set-Cookie", "gl=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0");
      return send(res, { ok: 1 });
    }

    const email = (b.email || "").trim().toLowerCase();

    if (b.action === "signup") {
      const bad = check(b) || ((b.pass || "").length < 6 ? "Use a password with at least 6 characters." : null);
      if (bad) return send(res, { err: bad });
      if ((await sql`SELECT 1 FROM users WHERE email = ${email}`).length) return send(res, { err: "That email already has an account. Log in instead." });
      const [u] = await sql`INSERT INTO users(name, email, mobile, pass_hash) VALUES(${b.name.trim()}, ${email}, ${b.mobile.trim()}, ${hash(b.pass)}) RETURNING id`;
      await start(res, u.id);
      return send(res, { ok: 1 });
    }

    if (b.action === "login") {
      const [u] = await sql`SELECT id, pass_hash FROM users WHERE email = ${email} AND deleted_at IS NULL`;
      if (!u || !verify(b.pass || "", u.pass_hash)) return send(res, { err: "Email or password is incorrect." });
      await start(res, u.id);
      return send(res, { ok: 1 });
    }

    send(res, { err: "Unknown action." }, 400);
  } catch (e) {
    fail(res, e);
  }
}
