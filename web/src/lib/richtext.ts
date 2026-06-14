import DOMPurify from "dompurify";

/**
 * Rich-text helpers for community posts. Post bodies are stored as either
 * legacy plain text or sanitized HTML (see `bodyFormat` on the posts table).
 * Markup is always sanitized again here, on render, so a malicious or stale
 * stored value can never inject script into the page.
 */

// Tags the editor can produce; everything else is stripped on render.
const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "strike",
  "del",
  "h1",
  "h2",
  "h3",
  "h4",
  "ul",
  "ol",
  "li",
  "blockquote",
  "code",
  "pre",
  "a",
  "hr",
  "span",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "colgroup",
  "col",
  "img",
  "figure",
  "figcaption",
];

const ALLOWED_ATTR = [
  "href",
  "colspan",
  "rowspan",
  "colwidth",
  "data-colwidth",
  "src",
  "alt",
  "title",
  "width",
  "height",
];

let hookInstalled = false;

/**
 * Harden surviving links and images. Links open safely in a new tab. Images
 * are restricted to `https:` sources (anything else — `http:`, `data:`,
 * protocol-relative, or a stripped src — is dropped) and never leak a referrer.
 */
function ensureLinkHook() {
  if (hookInstalled) return;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer nofollow");
    }
    if (node.tagName === "IMG") {
      const src = node.getAttribute("src") ?? "";
      if (!/^https:\/\//i.test(src)) {
        node.remove();
        return;
      }
      node.setAttribute("loading", "lazy");
      node.setAttribute("referrerpolicy", "no-referrer");
    }
  });
  hookInstalled = true;
}

/** Sanitize stored/editor HTML down to the post-safe tag + attribute set. */
export function sanitizeHtml(html: string): string {
  ensureLinkHook();
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:)/i,
  });
}

/** Flatten HTML to a single line of text — used for previews and emptiness. */
export function htmlToPlainText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** True when the HTML carries no visible text (e.g. an empty `<p></p>`). */
export function isHtmlEmpty(html: string): boolean {
  return htmlToPlainText(html).length === 0;
}

/** Wrap legacy plain text as HTML so it can seed the rich-text editor. */
export function plainToHtml(text: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .split(/\n{2,}/)
    .map((para) => `<p>${escape(para).replace(/\n/g, "<br>")}</p>`)
    .join("");
}
