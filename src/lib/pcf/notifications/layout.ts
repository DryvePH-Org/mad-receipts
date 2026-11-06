export const APP_URL = (
  process.env.APP_URL ?? "https://invoice.dryveph.io"
).replace(/\/$/, "");

export type Tone = "info" | "action" | "alert";

export type EmailContent = {
  tone: Tone;
  heading: string;
  greeting: string;
  paragraphs: string[];
  rows?: { label: string; value: string }[];
  cta?: { label: string; path: string };
};

const TONE_COLORS: Record<Tone, string> = {
  info: "#171717",
  action: "#1d4ed8",
  alert: "#b91c1c",
};

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function renderEmail(content: EmailContent) {
  const accent = TONE_COLORS[content.tone];
  const link = content.cta ? `${APP_URL}${content.cta.path}` : null;

  const rows = (content.rows ?? [])
    .map(
      (row) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#737373;vertical-align:top;white-space:nowrap">${escapeHtml(row.label)}</td><td style="padding:6px 0;color:#171717">${escapeHtml(row.value)}</td></tr>`,
    )
    .join("");

  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e5e5">
<div style="background:${accent};color:#ffffff;padding:16px 24px;font-size:13px;font-weight:600;letter-spacing:.3px">MAD · PCF</div>
<div style="padding:24px">
<h1 style="margin:0 0 16px;font-size:18px;color:#171717">${escapeHtml(content.heading)}</h1>
<p style="margin:0 0 12px;font-size:14px;color:#171717">${escapeHtml(content.greeting)}</p>
${content.paragraphs.map((p) => `<p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:#404040">${escapeHtml(p)}</p>`).join("")}
${rows ? `<table style="border-collapse:collapse;font-size:14px;margin:8px 0 16px">${rows}</table>` : ""}
${link ? `<p style="margin:20px 0 0"><a href="${link}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px">${escapeHtml(content.cta!.label)}</a></p>` : ""}
</div>
<div style="padding:16px 24px;border-top:1px solid #e5e5e5;font-size:12px;color:#737373">You're receiving this because of your PCF role in MAD.</div>
</div></body></html>`;

  const text = [
    content.heading,
    "",
    content.greeting,
    "",
    ...content.paragraphs.flatMap((p) => [p, ""]),
    ...(content.rows ?? []).map((row) => `${row.label}: ${row.value}`),
    ...(link ? ["", `${content.cta!.label}: ${link}`] : []),
  ].join("\n");

  return { html, text };
}
