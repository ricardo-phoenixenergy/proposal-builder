/**
 * Scope authored CSS (§3) so a layout's styles cannot leak into the app shell or
 * sibling sections: every rule selector is prefixed with `scope`. @media/@supports
 * blocks are preserved and their inner rules scoped. Exfiltration/execution vectors
 * are stripped. Deliberately conservative — @keyframes/@font-face/@page pass through
 * unscoped.
 *
 * Implementation: postcss AST walk + postcss-selector-parser for correct selector
 * rewriting. This fixes the security bypasses in the prior regex-based version:
 *  - @-rule allowlist (not blocklist) prevents escaped variants like @\69mport
 *  - postcss-selector-parser keeps :is(h1, h2) intact (does not split internal commas)
 *  - url() scheme allowlist with CSS-escape expansion blocks data:text/* and similar
 */
import postcss from "postcss";
import selectorParser from "postcss-selector-parser";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Sanitize a raw CSS text value (e.g. an inline `style` attribute).
 * Expands CSS escapes, strips expression()/behavior: declarations and
 * neutralizes any url() whose scheme is not on the allowlist.
 * This is the shared helper used by both scopeCss (for block CSS) and
 * sanitizeLayoutHtml (for inline style attributes) to keep them symmetric.
 */
export function sanitizeCssText(value: string): string {
  // Expand CSS hex escapes + line continuations first
  const expanded = expandCssEscapes(value);
  // Drop expression(...) entirely
  if (/expression\s*\(/i.test(expanded)) return "";
  // Drop behavior: declarations entirely
  if (/^\s*behavior\s*:/i.test(expanded)) return "";
  // Sanitize url() scheme
  return sanitizeUrlValues(value);
}

export function scopeCss(css: string, scope: string): string {
  // Pre-sanitize: strip backslash-escaped at-rules (e.g. @\69mport) before handing
  // to postcss. These are never valid CSS and postcss throws "At-rule without name"
  // on them. Strip the entire statement up to the next semicolon or block end.
  const preCleaned = stripEscapedAtRules(css);
  const root = postcss.parse(preCleaned);
  sanitizeAndScope(root, scope);
  return root.toResult().css;
}

/**
 * Strip at-rules whose name contains a CSS backslash escape (e.g. @\69mport).
 * These cannot be named by the postcss AST, so we remove them before parsing
 * to prevent a CssSyntaxError while ensuring no smuggled rules survive.
 * Pattern: @ followed by a backslash — consume to the next ; or { ... } block end.
 */
function stripEscapedAtRules(css: string): string {
  return css.replace(/@\\[^{;]*(?:\{[^}]*\})?;?/g, "");
}

// ---------------------------------------------------------------------------
// @-rule allowlist (names are lower-case; matching is done case-insensitively)
// ---------------------------------------------------------------------------

/** At-rules whose block body content is recursed into (inner rules get scoped). */
const CONDITIONAL_AT_RULES = new Set(["media", "supports"]);

/** At-rules whose inner selectors must NOT be scoped (e.g. keyframe steps 0%, from, to). */
const KEYFRAME_AT_RULES = new Set([
  "keyframes",
  "-webkit-keyframes",
  "-moz-keyframes",
  "-o-keyframes",
]);

/** At-rules allowed through with their block body intact but NOT recursed into for scoping. */
const PASSTHROUGH_AT_RULES = new Set(["font-face", "page"]);

// All allowed at-rule names (union of the three sets above).
const ALLOWED_AT_RULES = new Set([
  ...CONDITIONAL_AT_RULES,
  ...KEYFRAME_AT_RULES,
  ...PASSTHROUGH_AT_RULES,
]);

// ---------------------------------------------------------------------------
// AST sanitiser + scoper (single-pass)
// ---------------------------------------------------------------------------

function sanitizeAndScope(container: postcss.Container, scope: string): void {
  const toRemove: postcss.ChildNode[] = [];

  container.each((node) => {
    if (node.type === "atrule") {
      const name = node.name.toLowerCase();

      if (!ALLOWED_AT_RULES.has(name)) {
        // Allowlist-inversion: remove everything not explicitly known-safe.
        // This also covers any escaped at-rule names that postcss normalises,
        // since they won't appear in ALLOWED_AT_RULES.
        toRemove.push(node);
        return;
      }

      if (CONDITIONAL_AT_RULES.has(name)) {
        // Recurse; inner rules need scoping
        sanitizeAndScope(node, scope);
      } else if (KEYFRAME_AT_RULES.has(name)) {
        // Do NOT scope inner keyframe steps (0%, from, to …)
        // Sanitise declarations only
        sanitizeDeclarationsIn(node);
      } else {
        // PASSTHROUGH_AT_RULES (@font-face, @page): sanitise declarations only
        sanitizeDeclarationsIn(node);
      }
    } else if (node.type === "rule") {
      // Scope selectors via postcss-selector-parser
      node.selector = scopeSelector(node.selector, scope);
      // Sanitise declarations
      sanitizeDeclarationsIn(node);
    } else if (node.type === "decl") {
      if (sanitizeDeclaration(node) === "remove") {
        toRemove.push(node);
      }
    }
  });

  for (const n of toRemove) {
    n.remove();
  }
}

// ---------------------------------------------------------------------------
// Declaration-level sanitisation (url(), expression(), behavior:)
// ---------------------------------------------------------------------------

function sanitizeDeclarationsIn(container: postcss.Container): void {
  const toRemove: postcss.ChildNode[] = [];

  container.walk((node) => {
    if (node.type === "decl") {
      if (sanitizeDeclaration(node) === "remove") toRemove.push(node);
    }
  });

  for (const n of toRemove) {
    n.remove();
  }
}

/**
 * Sanitise a single declaration in-place.
 * Returns "remove" if the declaration itself should be dropped.
 */
function sanitizeDeclaration(decl: postcss.Declaration): "remove" | undefined {
  // Drop behavior: entirely (IE extension; execution vector)
  if (decl.prop.toLowerCase() === "behavior") {
    return "remove";
  }

  // Strip expression(...) occurrences from values (IE CSS expression injection)
  if (/expression\s*\(/i.test(decl.value)) {
    return "remove";
  }

  // Sanitise url() values
  decl.value = sanitizeUrlValues(decl.value);

  return undefined;
}

// ---------------------------------------------------------------------------
// url() scheme allowlist
// ---------------------------------------------------------------------------

/**
 * For every url(...) token in a CSS value string, expand CSS escape sequences
 * then allowlist the scheme. Allowed:
 *   - https: URLs
 *   - data:image/(png|jpeg|gif|webp) data URIs (raster only)
 *   - relative paths (no scheme — no ":" before the first "/" or end of string)
 * Everything else is replaced with url().
 */
function sanitizeUrlValues(value: string): string {
  return value.replace(
    /url\(\s*(["']?)([^)]*?)\1\s*\)/gi,
    (match: string, _quote: string, rawCapture: unknown) => {
      const raw = String(rawCapture);
      const expanded = expandCssEscapes(raw.trim());
      if (isAllowedUrl(expanded)) {
        return match; // keep original — preserve author formatting
      }
      return "url()";
    },
  );
}

/**
 * Expand CSS hex-escape sequences (\\XX or \\XXXXXX) and CSS line-continuations
 * (backslash immediately before a newline) so that schemes like `java\73cript:`
 * can be detected before scheme-checking.
 */
function expandCssEscapes(s: string): string {
  // Remove CSS line-continuations: backslash + newline
  s = s.replace(/\\\n/g, "");
  // Expand CSS hex escapes: \XXXXXX (1–6 hex digits) optionally followed by whitespace
  s = s.replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_m: string, hexCapture: unknown) => {
    const hex = String(hexCapture);
    return String.fromCodePoint(parseInt(hex, 16));
  });
  // Expand other single-char backslash escapes (e.g. \a → a)
  s = s.replace(/\\(.)/g, "$1");
  return s;
}

function isAllowedUrl(url: string): boolean {
  const lower = url.toLowerCase();

  // Relative path — no scheme colon before the first slash or end-of-string
  const colonIdx = lower.indexOf(":");
  const slashIdx = lower.search(/[/\\]/);
  if (colonIdx === -1 || (slashIdx !== -1 && slashIdx < colonIdx)) {
    return true;
  }

  // https:
  if (lower.startsWith("https:")) return true;

  // data:image/(png|jpeg|gif|webp) — raster only
  if (/^data:image\/(png|jpeg|gif|webp)[;,]/i.test(url)) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Selector scoping via postcss-selector-parser
// ---------------------------------------------------------------------------

function scopeSelector(selectorStr: string, scope: string): string {
  // Use postcss-selector-parser only to split the selector list correctly
  // (so commas inside :is()/:has() are not split), then string-prepend scope.
  const scopedParts: string[] = [];

  const transform = selectorParser((selectors) => {
    selectors.each((selector) => {
      // Serialize this top-level selector to its string form
      const selectorString = selector.toString().trim();
      // Prepend the scope + space
      scopedParts.push(`${scope} ${selectorString}`);
    });
  });

  // Run the parser to populate scopedParts, then join the results
  transform.processSync(selectorStr);
  return scopedParts.join(",");
}
