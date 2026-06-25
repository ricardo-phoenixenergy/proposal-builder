import type { SectionLayout, ThemeTokens } from "@proposal/shared";
import { interpolate, sanitizeLayoutHtml, scopeCss, getPageFormat } from "@proposal/shared";

type Data = Record<string, unknown>;

/**
 * Render an authored HTML/CSS template layout (§4): interpolate data (escaped),
 * sanitize the HTML, scope the CSS to this layout's wrapper. No JS executes.
 *
 * Safety invariant: interpolate escapes all data values → sanitizeLayoutHtml
 * strips forbidden tags/attrs → dangerouslySetInnerHTML receives only safe HTML.
 * The ordering of these two steps MUST NOT change.
 */
export function TemplateRenderer({
  layout,
  data,
  pageFormat,
}: {
  layout: SectionLayout;
  data: Data;
  pageFormat?: string;
  theme?: ThemeTokens;
}) {
  const scope = `[data-layout="${layout.type}:${layout.variant}"]`;
  // Safety + robustness: interpolate escapes data, sanitizeLayoutHtml strips
  // scripts/events. Both run on author-saved content, so a single malformed layout
  // must never throw and 500 the whole document (§ graceful degradation). On failure
  // the section degrades to empty rather than crashing the render; scopeCss already
  // self-degrades to "" on malformed CSS.
  let html = "";
  try {
    html = sanitizeLayoutHtml(interpolate(layout.template ?? "", data));
  } catch {
    html = "";
  }
  const css = layout.css ? scopeCss(layout.css, scope) : "";
  const fmt = getPageFormat(pageFormat ?? layout.pageFormat);
  return (
    <div
      data-layout={`${layout.type}:${layout.variant}`}
      style={
        {
          "--page-w": `${fmt.widthMm}mm`,
          "--page-h": `${fmt.heightMm}mm`,
          "--page-margin": `${fmt.marginMm}mm`,
        } as React.CSSProperties
      }
    >
      {css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null}
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
