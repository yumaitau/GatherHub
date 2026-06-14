/**
 * GatherHub-branded email templates. Built as inline-styled HTML + a plain-text
 * alternative so they render across email clients (which strip <style>/external
 * CSS). Visual language follows the "Quiet Operator" system: flat surfaces, a
 * slate-blue accent, generous spacing, Inter with system fallbacks.
 */

const ACCENT = "#3b6fd0";
const INK = "#2c2f3d";
const INK_SOFT = "#5b6172";
const LINE = "#e6e8ec";
const SURFACE = "#f5f6f8";
const FONT =
  "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Flatten post HTML to readable plain text for the text/plain email part. */
export function htmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h[1-6]|tr|blockquote)\s*>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

/** Ready-to-embed body HTML: sanitized post HTML as-is, or escaped plain text. */
export function postContentHtml(body: string, isHtml: boolean): string {
  if (isHtml) return body;
  return escapeHtml(body).replace(/\n/g, "<br>");
}

export type PostEmailInput = {
  orgName: string;
  orgLogo?: string;
  authorName: string;
  teamName?: string;
  postTitle?: string;
  /** Sanitized HTML (html posts) or escaped+<br> HTML (plain posts). */
  bodyHtml: string;
  /** Plain-text rendering of the body for the text part. */
  bodyText: string;
  postUrl: string;
  unsubscribeUrl: string;
  recipientName?: string;
};

export function postEmailSubject(input: {
  orgName: string;
  teamName?: string;
  postTitle?: string;
}): string {
  if (input.postTitle) return `${input.orgName}: ${input.postTitle}`;
  return `New post in ${input.teamName ?? input.orgName}`;
}

export function renderPostEmail(input: PostEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = postEmailSubject(input);
  const greeting = input.recipientName
    ? `Hi ${escapeHtml(input.recipientName.split(" ")[0] ?? input.recipientName)},`
    : "Hi,";
  const scope = input.teamName
    ? `${escapeHtml(input.teamName)} · ${escapeHtml(input.orgName)}`
    : escapeHtml(input.orgName);
  const byline = `Posted by ${escapeHtml(input.authorName)} in ${scope}`;
  const logo = input.orgLogo
    ? `<img src="${escapeHtml(input.orgLogo)}" width="36" height="36" alt="" style="border-radius:8px;vertical-align:middle;margin-right:10px;">`
    : "";

  const html = `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${SURFACE};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(htmlSnippet(input.bodyText))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SURFACE};padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:92%;background:#ffffff;border:1px solid ${LINE};border-radius:12px;overflow:hidden;font-family:${FONT};">
<tr><td style="height:3px;background:${ACCENT};"></td></tr>
<tr><td style="padding:22px 28px 6px;">
${logo}<span style="font-size:15px;font-weight:600;color:${INK};vertical-align:middle;">${escapeHtml(input.orgName)}</span>
</td></tr>
<tr><td style="padding:6px 28px 0;">
<p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:${ACCENT};">New community post</p>
${input.postTitle ? `<h1 style="margin:0 0 4px;font-size:21px;line-height:1.25;font-weight:700;color:${INK};">${escapeHtml(input.postTitle)}</h1>` : ""}
<p style="margin:0 0 16px;font-size:13px;color:${INK_SOFT};">${byline}</p>
</td></tr>
<tr><td style="padding:0 28px;">
<p style="margin:0 0 12px;font-size:15px;color:${INK};">${greeting}</p>
<div style="font-size:15px;line-height:1.5;color:${INK};">${input.bodyHtml}</div>
</td></tr>
<tr><td style="padding:22px 28px 4px;">
<a href="${escapeHtml(input.postUrl)}" style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:8px;">Read in the app</a>
</td></tr>
<tr><td style="padding:24px 28px 22px;">
<hr style="border:none;border-top:1px solid ${LINE};margin:0 0 14px;">
<p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:${INK_SOFT};">You're receiving this because you're a member of ${escapeHtml(input.orgName)}.</p>
<p style="margin:0;font-size:12px;line-height:1.5;color:${INK_SOFT};"><a href="${escapeHtml(input.unsubscribeUrl)}" style="color:${INK_SOFT};text-decoration:underline;">Unsubscribe from post emails</a> · Powered by GatherHub</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    subject,
    "",
    byline,
    "",
    input.bodyText,
    "",
    `Read in the app: ${input.postUrl}`,
    "",
    `You're receiving this because you're a member of ${input.orgName}.`,
    `Unsubscribe: ${input.unsubscribeUrl}`,
  ].join("\n");

  return { subject, html, text };
}

/** Short preview line for the email's hidden preheader. */
function htmlSnippet(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 140 ? `${flat.slice(0, 137)}…` : flat;
}
