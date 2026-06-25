import sanitizeHtml from "sanitize-html";
import { sanitizeCssText } from "./scopeCss";

/**
 * Sanitize assembled layout HTML (§3 safety). Authors are trusted but rendering
 * happens server-side with secrets in scope and ships to external share viewers,
 * so this is defense in depth: an allowlist of structural/text/image tags, no
 * scripts, no event handlers, no non-https/data:image URLs, no <style>/<link>.
 *
 * Inline `style` attributes are passed through sanitizeCssText (shared with
 * scopeCss) so that expression(), behavior:, and url(javascript:) are stripped
 * symmetrically — matching what scopeCss does for authored CSS blocks.
 *
 * <img src> accepts https: and data:image/(png|jpeg|gif|webp) only; other
 * data: MIME types (text/html, image/svg+xml, etc.) are stripped via transformTags.
 * Note: allowedSchemesByTag.img must include "data" so sanitize-html passes data:
 * values through; transformTags.img then narrows it to raster MIME types only.
 */
export function sanitizeLayoutHtml(dirty: string): string {
  return sanitizeHtml(dirty, {
    allowedTags: [
      "section",
      "article",
      "div",
      "span",
      "header",
      "footer",
      "main",
      "aside",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "p",
      "blockquote",
      "small",
      "sup",
      "sub",
      "ul",
      "ol",
      "li",
      "table",
      "thead",
      "tbody",
      "tfoot",
      "tr",
      "th",
      "td",
      "img",
      "figure",
      "figcaption",
      "strong",
      "em",
      "b",
      "i",
      "u",
      "br",
      "hr",
      "a",
    ],
    allowedAttributes: {
      "*": ["class", "style"],
      img: ["src", "alt", "width", "height"],
      a: ["href", "target", "rel"],
    },
    allowedSchemes: ["https"],
    // "data" must remain here so sanitize-html passes data: src values to
    // transformTags.img, which then narrows to raster MIME types only (Fix 2).
    allowedSchemesByTag: { img: ["https", "data"], a: ["https", "mailto"] },
    transformTags: {
      // Fix 1: sanitize inline style attributes on every element using the shared
      // sanitizeCssText helper from scopeCss, keeping the two sanitizers symmetric.
      // This neutralizes expression(), behavior:, and url(javascript:) in inline styles.
      "*"(tagName, attribs) {
        if (attribs["style"]) {
          const cleaned = sanitizeCssText(attribs["style"]);
          return { tagName, attribs: { ...attribs, style: cleaned } };
        }
        return { tagName, attribs };
      },
      // Fix 2: restrict <img src> to https: and raster data: URIs only.
      // sanitize-html's allowedSchemesByTag passes any data: value through, so
      // we validate the src here and strip disallowed MIME types (text/html,
      // image/svg+xml, etc.) by removing the src attribute entirely.
      img(tagName, attribs) {
        const src = attribs["src"] ?? "";
        if (src.startsWith("data:") && !/^data:image\/(png|jpeg|gif|webp)[;,]/i.test(src)) {
          const { src: _dropped, ...rest } = attribs;
          return { tagName, attribs: rest };
        }
        return { tagName, attribs };
      },
    },
    disallowedTagsMode: "discard",
  });
}
