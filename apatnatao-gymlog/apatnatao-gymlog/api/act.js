import { sql, init, fail, who, body, send, check, hash, idOf } from "../lib/db.js";

const addDays = (s, k) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10); };
const snap = async id => (await sql`SELECT plan, to_char(expires, 'YYYY-MM-DD') AS expires, suspended, (deleted_at IS NOT NULL) AS deleted FROM users WHERE id = ${id} AND role = 'member'`)[0];
const apply = (id, s) => sql`UPDATE users SET plan = ${s.plan}, expires = ${s.expires}::date, suspended = ${s.suspended}, deleted_at = CASE WHEN ${s.deleted}::boolean THEN COALESCE(deleted_at, now()) ELSE NULL END WHERE id = ${id}`;
const record = (id, by, summary, note, before, after) => sql`INSERT INTO member_log(user_id, staff_name, summary, note, before, after) VALUES(${id}, ${by}, ${summary}, ${note}, ${JSON.stringify(before)}::jsonb, ${JSON.stringify(after)}::jsonb)`;

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return send(res, { err: "Use POST." }, 405);
    await init();
    const u = await who(req);
    if (!u) return send(res, { err: "Please log in again." }, 401);
    const b = body(req), staff = u.role === "staff";

    if (b.op === "scan") {
      const raw = String(b.id || "").toUpperCase(), n = idOf(raw);
      if (!staff && n !== u.id) return send(res, { err: "You can only check yourself in." }, 403);
      const [m] = n ? await sql`SELECT id, name, suspended, expires IS NULL AS none, expires < CURRENT_DATE AS expired FROM users WHERE id = ${n} AND role = 'member' AND deleted_at IS NULL` : [];
      if (!m) {
        await sql`INSERT INTO visits(tried, ok) VALUES(${raw.slice(0, 40)}, false)`;
        return send(res, { k: "no", why: "unknown" });
      }
      const [open] = await sql`SELECT id FROM visits WHERE user_id = ${m.id} AND ok AND out_at IS NULL AND in_at > now() - interval '14 hours' LIMIT 1`;
      if (open) {
        const [r] = await sql`UPDATE visits SET out_at = now() WHERE id = ${open.id} RETURNING (extract(epoch FROM out_at - in_at) / 60)::float AS mins`;
        return send(res, { k: "out", name: m.name, mins: Math.max(1, Math.round(r.mins)) });
      }
      const why = m.suspended ? "suspended" : m.none ? "none" : m.expired ? "expired" : null;
      await sql`INSERT INTO visits(user_id, ok) VALUES(${m.id}, ${!why})`;
      return send(res, why ? { k: "no", why, name: m.name } : { k: "ok", name: m.name });
    }

    if (!staff) return send(res, { err: "Staff only." }, 403);

    if (b.op === "manage") {
      // Every change is recorded with a before and after snapshot, so the latest one can be undone.
      if (b.act === "undo") {
        const [e] = await sql`SELECT id, user_id, summary, before, undone FROM member_log WHERE id = ${Number(b.logId) || 0}`;
        const [last] = e ? await sql`SELECT max(id) AS id FROM member_log WHERE user_id = ${e.user_id}` : [];
        if (!e || e.undone || last.id !== e.id) return send(res, { err: "Only the latest change to a member can be undone." });
        const cur = await snap(e.user_id);
        await apply(e.user_id, e.before);
        await sql`UPDATE member_log SET undone = true WHERE id = ${e.id}`;
        await record(e.user_id, u.name, "Undid: " + e.summary, "", cur, e.before);
        return send(res, { ok: 1, summary: "Undid: " + e.summary });
      }
      const n = idOf(String(b.id || "").toUpperCase());
      const before = n && await snap(n);
      if (!before) return send(res, { err: "Member not found." }, 404);
      const today = /^\d{4}-\d{2}-\d{2}$/.test(b.today || "") ? b.today : (await sql`SELECT to_char(CURRENT_DATE, 'YYYY-MM-DD') AS d`)[0].d;
      const note = String(b.note || "").trim().slice(0, 200);
      const after = { ...before };
      let summary;
      if (b.act === "adjust") {
        if (before.deleted) return send(res, { err: "Restore this member first." });
        const days = Math.trunc(Number(b.days));
        if (!days || Math.abs(days) > 3650) return send(res, { err: "Enter a number of days from 1 to 3650. Use a minus sign to remove days." });
        if (days < 0 && !before.expires) return send(res, { err: "This member has no membership to reduce." });
        // Adding extends from the current expiry if still valid, otherwise from today. Removing counts back from the expiry.
        after.expires = days > 0 ? addDays(before.expires && before.expires > today ? before.expires : today, days) : addDays(before.expires, days);
        after.plan = ["Monthly", "Annual"].includes(b.plan) ? b.plan : (before.plan || "Custom");
        summary = (days > 0 ? "Added " : "Removed ") + Math.abs(days) + " day" + (Math.abs(days) === 1 ? "" : "s");
      } else if (b.act === "toggle") {
        if (before.deleted) return send(res, { err: "Restore this member first." });
        after.suspended = !before.suspended;
        summary = after.suspended ? "Suspended account" : "Restored account";
      } else if (b.act === "remove") {
        if (before.deleted) return send(res, { err: "Already removed." });
        after.deleted = true;
        summary = "Removed member";
      } else if (b.act === "restore") {
        if (!before.deleted) return send(res, { err: "This member is not removed." });
        after.deleted = false;
        summary = "Restored removed member";
      } else return send(res, { err: "Unknown action." }, 400);
      await apply(n, after);
      if (b.act === "remove") {
        await sql`DELETE FROM sessions WHERE user_id = ${n}`;
        await sql`UPDATE visits SET out_at = now() WHERE user_id = ${n} AND ok AND out_at IS NULL`;
      }
      await record(n, u.name, summary, note, before, after);
      return send(res, { ok: 1, summary, expires: after.expires });
    }

    if (b.op === "register") {
      const bad = check(b);
      if (bad) return send(res, { err: bad });
      const email = b.email.trim().toLowerCase();
      if ((await sql`SELECT 1 FROM users WHERE email = ${email}`).length) return send(res, { err: "That email already has an account." });
      await sql`INSERT INTO users(name, email, mobile, pass_hash) VALUES(${b.name.trim()}, ${email}, ${b.mobile.trim()}, ${hash("welcome123")})`;
      return send(res, { ok: 1 });
    }

    send(res, { err: "Unknown request." }, 400);
  } catch (e) {
    fail(res, e);
  }
}
