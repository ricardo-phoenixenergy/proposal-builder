import sanitizeHtml from "sanitize-html";

/**
 * Sanitize assembled layout HTML (§3 safety). Authors are trusted but rendering
 * happens server-side with secrets in scope and ships to external share viewers,
 * so this is defense in depth: an allowlist of structural/text/image tags, no
 * scripts, no event handlers, no non-https/data:image URLs, no <style>/<link>.
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
    allowedSchemesByTag: { img: ["https", "data"], a: ["https", "mailto"] },
    // sanitize-html keeps inline style but neutralises javascript:/expression().
    disallowedTagsMode: "discard",
  });
}
