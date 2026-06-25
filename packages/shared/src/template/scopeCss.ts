/**
 * Scope authored CSS (§3) so a layout's styles cannot leak into the app shell or
 * sibling sections: every rule selector is prefixed with `scope`. @media/@supports
 * blocks are preserved and their inner rules scoped. Exfiltration/execution vectors
 * are stripped. Deliberately conservative — @keyframes/@font-face/@page pass through
 * unscoped.
 *
 * Known limitations:
 *  - CSS comments (`/* ... *\/`) inside selector preludes may be included verbatim
 *    in the scoped selector output; they are not stripped before prefixing.
 *  - Nested CSS (CSS Nesting Level 1, &-rules) is not recognised; inner & rules will
 *    be treated as normal selectors and incorrectly prefixed.
 *  - @layer, @namespace, @charset and other at-rules without a block body are silently
 *    dropped (they don't follow selector{block} grammar).
 *  - url() stripping replaces unsafe schemes with url() (empty); it does not fully
 *    validate data: URIs (those are passed through).
 */
export function scopeCss(css: string, scope: string): string {
  const cleaned = stripUnsafe(css);
  return scopeRules(cleaned, scope);
}

// ---------------------------------------------------------------------------
// Safety stripping
// ---------------------------------------------------------------------------

function stripUnsafe(css: string): string {
  return (
    css
      // Remove @import entirely (including trailing semicolon if present)
      .replace(/@import[^;]*;?/gi, "")
      // Remove expression() (IE CSS expression injection)
      .replace(/expression\s*\([^)]*\)/gi, "")
      // Remove behavior: property (IE behaviour extension)
      .replace(/behavior\s*:[^;}]*/gi, "")
      // Neutralise unsafe url() schemes: javascript:, vbscript:, http: (non-https)
      // data: and https: are intentionally allowed
      .replace(/url\(\s*['"]?\s*(?:javascript|vbscript|http):[^)]*\)/gi, "url()")
  );
}

// ---------------------------------------------------------------------------
// Rule-walking scoper
// ---------------------------------------------------------------------------

/**
 * Walk top-level CSS rules (or the inner content of an @media/@supports block),
 * prefix every selector with `scope`, and recurse into conditional group rules.
 */
function scopeRules(css: string, scope: string): string {
  let out = "";
  let i = 0;

  while (i < css.length) {
    // Skip whitespace between rules
    if (css[i] === " " || css[i] === "\n" || css[i] === "\r" || css[i] === "\t") {
      i++;
      continue;
    }

    const brace = css.indexOf("{", i);
    if (brace === -1) break;

    const prelude = css.slice(i, brace).trim();
    const body = matchBlock(css, brace);

    if (/^@media/i.test(prelude) || /^@supports/i.test(prelude)) {
      // Conditional group rule: recurse into inner rules
      out += `${prelude}{${scopeRules(body.inner, scope)}}`;
    } else if (/^@(?:keyframes|-webkit-keyframes|-moz-keyframes|font-face|page)/i.test(prelude)) {
      // Pass-through at-rules: preserve verbatim, do not scope inner content
      out += `${prelude}{${body.inner}}`;
    } else if (prelude) {
      // Regular rule: prefix each selector in the comma-separated list
      const scoped = prelude
        .split(",")
        .map((s) => `${scope} ${s.trim()}`)
        .join(",");
      out += `${scoped}{${body.inner}}`;
    }

    i = body.end;
  }

  return out;
}

// ---------------------------------------------------------------------------
// Brace-matching utility
// ---------------------------------------------------------------------------

/**
 * Given the index of the opening `{`, find the matching closing `}` respecting
 * nesting depth. Returns the content between the braces and the index after `}`.
 */
function matchBlock(css: string, open: number): { inner: string; end: number } {
  let depth = 0;
  for (let j = open; j < css.length; j++) {
    if (css[j] === "{") depth++;
    else if (css[j] === "}" && --depth === 0) {
      return { inner: css.slice(open + 1, j), end: j + 1 };
    }
  }
  // Unclosed block — consume to end
  return { inner: css.slice(open + 1), end: css.length };
}
