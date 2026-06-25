const ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function esc(v: unknown): string {
  if (v == null) return "";
  const s =
    typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? String(v) : "";
  return s.replace(/[&<>"']/g, (c) => ESCAPE[c]!);
}

/** Resolve a dotted path (e.g. "ds.rows") against a context object. */
function lookup(ctx: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => {
    if (acc != null && typeof acc === "object") {
      const obj = acc as Record<string, unknown>;
      return Object.prototype.hasOwnProperty.call(obj, k) ? obj[k] : undefined;
    }
    return undefined;
  }, ctx);
}

/**
 * A deliberately tiny, logic-less template engine (§2). NO arbitrary expressions,
 * helpers, or function calls — only field substitution, list/row iteration, and
 * presence conditionals. Substituted values are HTML-escaped so interpolated data
 * (AI text, uploaded URLs) can never inject markup.
 *
 * Supported syntax:
 *   {{key}}                            – scalar substitution (HTML-escaped)
 *   {{#each key}}…{{this}}…{{/each}}   – iterate an array of scalars
 *   {{#each key.rows}}…{{col}}…{{/each}} – iterate dataset rows (bare keys resolve against row)
 *   {{#if key}}…{{else}}…{{/if}}       – presence conditional
 *
 * Unknown keys render as empty string. No arbitrary JS/expressions.
 */
export function interpolate(template: string, data: Record<string, unknown>): string {
  return render(template, data);
}

function render(tpl: string, ctx: Record<string, unknown>): string {
  let out = "";
  let pos = 0;

  while (pos < tpl.length) {
    const open = tpl.indexOf("{{", pos);
    if (open === -1) {
      out += tpl.slice(pos);
      break;
    }
    const close = tpl.indexOf("}}", open);
    if (close === -1) {
      // Malformed — emit the rest verbatim.
      out += tpl.slice(pos);
      break;
    }

    out += tpl.slice(pos, open);
    const tag = tpl.slice(open + 2, close).trim();
    const tagEnd = close + 2;

    if (tag.startsWith("#each ")) {
      const key = tag.slice(6).trim();
      const { inner, end } = extractBlock(tpl, tagEnd, "each");
      const list = lookup(ctx, key);
      if (Array.isArray(list)) {
        for (const item of list) {
          const itemCtx: Record<string, unknown> =
            item != null && typeof item === "object"
              ? { ...ctx, ...(item as Record<string, unknown>), this: item }
              : { ...ctx, this: item };
          out += render(inner, itemCtx);
        }
      }
      pos = end;
    } else if (tag.startsWith("#if ")) {
      const key = tag.slice(4).trim();
      const { inner, end } = extractBlock(tpl, tagEnd, "if");
      const [truthy, falsy] = splitElse(inner);
      out += lookup(ctx, key) ? render(truthy, ctx) : render(falsy, ctx);
      pos = end;
    } else if (tag === "/each" || tag === "/if" || tag === "else") {
      // Stray closing/else tags — should be consumed by extractBlock, but skip
      // them gracefully if encountered at the top level.
      pos = tagEnd;
    } else if (tag.length > 0) {
      // {{key}} or {{this}} — scalar substitution
      out += esc(lookup(ctx, tag));
      pos = tagEnd;
    } else {
      // Empty tag {{}} — skip
      pos = tagEnd;
    }
  }

  return out;
}

/**
 * Starting from `from` (right after an opening `{{#each …}}` or `{{#if …}}`),
 * find the matching `{{/each}}` or `{{/if}}` (tracking depth for nesting), and
 * return the inner content and the index past the closing tag.
 */
function extractBlock(
  tpl: string,
  from: number,
  kind: "each" | "if",
): { inner: string; end: number } {
  const openTag = kind === "each" ? "#each " : "#if ";
  const closeTag = `/${kind}`;
  let depth = 1;
  let pos = from;

  while (pos < tpl.length) {
    const next = tpl.indexOf("{{", pos);
    if (next === -1) break;
    const closePos = tpl.indexOf("}}", next);
    if (closePos === -1) break;

    const tag = tpl.slice(next + 2, closePos).trim();
    const tagEnd = closePos + 2;

    if (tag.startsWith(openTag)) {
      depth++;
    } else if (tag === closeTag) {
      depth--;
      if (depth === 0) {
        return { inner: tpl.slice(from, next), end: tagEnd };
      }
    }
    pos = tagEnd;
  }

  // Unclosed block — return everything remaining as inner content.
  return { inner: tpl.slice(from), end: tpl.length };
}

function splitElse(inner: string): [string, string] {
  // Find a top-level {{else}} (not inside a nested block).
  // We need to skip over nested {{#if}}…{{/if}} blocks so we only split on
  // an {{else}} that belongs to the current level.
  let depth = 0;
  let pos = 0;

  while (pos < inner.length) {
    const next = inner.indexOf("{{", pos);
    if (next === -1) break;
    const closePos = inner.indexOf("}}", next);
    if (closePos === -1) break;

    const tag = inner.slice(next + 2, closePos).trim();
    const tagEnd = closePos + 2;

    if (tag.startsWith("#if ") || tag.startsWith("#each ")) {
      depth++;
    } else if (tag === "/if" || tag === "/each") {
      depth--;
    } else if (tag === "else" && depth === 0) {
      return [inner.slice(0, next), inner.slice(tagEnd)];
    }
    pos = tagEnd;
  }

  return [inner, ""];
}
