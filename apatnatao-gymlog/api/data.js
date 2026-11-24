import { sql, init, fail, who, send, code, pub } from "../lib/db.js";

// Visits left open for more than 14 hours (a member who forgot to scan out) are ignored everywhere.
export default async function handler(req, res) {
  try {
    await init();
    const u = await who(req);
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM visits WHERE ok AND out_at IS NULL AND in_at > now() - interval '14 hours'`;
    if (!u) return send(res, { me: null, inside: n, users: [], visits: [], anon: [], log: [] });

    // Anonymous visit times, so members can see peak and quiet hours without seeing anyone else's name.
    const anon = (await sql`SELECT in_at FROM visits WHERE ok AND in_at > now() - interval '30 days'`).map(r => ({ in: r.in_at }));
    let users = [], visits, log = [];

    if (u.role === "staff") {
      users = (await sql`SELECT id, name, email, mobile, role, plan, to_char(expires, 'YYYY-MM-DD') AS expires, suspended, (deleted_at IS NOT NULL) AS deleted FROM users WHERE role = 'member' ORDER BY id`).map(pub);
      visits = (await sql`SELECT v.user_id, v.tried, u.name, v.in_at, v.out_at, v.ok FROM visits v LEFT JOIN users u ON u.id = v.user_id
        WHERE v.in_at > now() - interval '30 days' ORDER BY v.in_at DESC LIMIT 1000`)
        .map(r => ({ m: r.user_id ? code({ id: r.user_id, role: "member" }) : r.tried, name: r.name || "Unknown ID", in: r.in_at, out: r.out_at, ok: r.ok }));
      log = (await sql`SELECT id, user_id, staff_name, summary, note, before, after, undone, at FROM member_log ORDER BY id DESC LIMIT 300`)
        .map(r => ({ id: r.id, m: code({ id: r.user_id, role: "member" }), by: r.staff_name, summary: r.summary, note: r.note, before: r.before, after: r.after, undone: r.undone, at: r.at }));
    } else {
      visits = (await sql`SELECT in_at, out_at FROM visits WHERE user_id = ${u.id} AND ok ORDER BY in_at DESC LIMIT 200`)
        .map(r => ({ m: code(u), in: r.in_at, out: r.out_at, ok: true }));
    }
    send(res, { me: pub(u), inside: n, users, visits, anon, log });
  } catch (e) {
    fail(res, e);
  }
}
