// Email digest — render the notification email and send it via Resend.
//
// No SDK dependency: Resend has a plain HTTP API, so we POST with global fetch
// and keep the project dependency-free. renderDigest() is pure (unit-tested);
// sendEmail() is the only side effect.

const esc = (s) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));

// Build the subject + HTML + text for a set of roles. `meta` carries the window
// label (e.g. "the last hour"), the app URL, and the RSS feed URL for the footer.
export function renderDigest(jobs, { windowLabel, appUrl = "", feedUrl = "" } = {}) {
  const n = jobs.length;
  const subject = `JobNotifier — ${n} new ${n === 1 ? "role" : "roles"} (${windowLabel})`;

  const rows = jobs
    .map((j) => {
      const tag =
        j.sponsorship === "verified"
          ? ' <span style="font:700 10px monospace;color:#b8bb26;border:1px solid #b8bb26;border-radius:4px;padding:0 4px">H-1B</span>'
          : "";
      const meta = [j.location, j.role, j.position, j.workType, j.source]
        .filter((v) => v && v !== "Not specified")
        .map(esc)
        .join(" &middot; ");
      return `
      <tr><td style="padding:12px 0;border-bottom:1px solid #3c3836">
        <div style="font:600 15px system-ui,sans-serif;color:#ebdbb2">${esc(j.title)}${tag}</div>
        <div style="font:500 13px system-ui,sans-serif;color:#d5c4a1;margin:2px 0 4px">${esc(j.company)}</div>
        <div style="font:400 12px system-ui,sans-serif;color:#a89984">${meta}</div>
        <a href="${esc(j.url)}" style="font:600 12px system-ui,sans-serif;color:#fe8019;text-decoration:none">Apply &rarr;</a>
      </td></tr>`;
    })
    .join("");

  const html = `<!doctype html><html><body style="margin:0;background:#282828;padding:20px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#32302f;border-radius:12px;padding:22px">
      <tr><td>
        <div style="font:700 18px system-ui,sans-serif;color:#fe8019">JobNotifier</div>
        <div style="font:400 13px system-ui,sans-serif;color:#928374;margin:2px 0 14px">${n} new tech &amp; AI ${n === 1 ? "role" : "roles"} from ${esc(windowLabel)}</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
        <div style="font:400 11px system-ui,sans-serif;color:#928374;margin-top:18px">
          ${appUrl ? `<a href="${esc(appUrl)}" style="color:#83a598;text-decoration:none">Open JobNotifier</a>` : ""}
          ${feedUrl ? ` &middot; <a href="${esc(feedUrl)}" style="color:#83a598;text-decoration:none">RSS feed</a>` : ""}
          <div style="margin-top:6px">Every company here cleared the sponsorship gate; H-1B marks name-verified recent filers.</div>
        </div>
      </td></tr>
    </table>
  </body></html>`;

  const text =
    `JobNotifier — ${n} new ${n === 1 ? "role" : "roles"} (${windowLabel})\n\n` +
    jobs
      .map((j) => {
        const meta = [j.location, j.role, j.position, j.workType, j.source]
          .filter((v) => v && v !== "Not specified")
          .join(" · ");
        const tag = j.sponsorship === "verified" ? " [H-1B]" : "";
        return `• ${j.title}${tag} — ${j.company}\n  ${meta}\n  ${j.url}`;
      })
      .join("\n\n") +
    (appUrl ? `\n\nOpen JobNotifier: ${appUrl}` : "");

  return { subject, html, text };
}

// Send one email through Resend. Throws on a non-2xx so the caller can report it.
export async function sendEmail({ apiKey, from, to, subject, html, text }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html, text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}
