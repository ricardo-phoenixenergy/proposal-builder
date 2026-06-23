import type { Key, ReactNode } from "react";
import type { Block, BlockBackground, ImageRef, SectionLayout, ThemeTokens } from "@proposal/shared";
import { compileBlockStyle, spaceToken, getSectionType, getPageFormat } from "@proposal/shared";
import { DataTable } from "../components/sections/DataTable";
import { ComparisonMatrix } from "../components/sections/ComparisonMatrix";
import { ChartView } from "../components/charts/ChartView";

type Data = Record<string, unknown>;

const asText = (v: unknown): string => (typeof v === "string" ? v : "");
const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)) : []);

/** minHeight scale → a rem block-height (v1 choice; "page" is handled separately). */
const MINH_REM: Record<string, number> = { xs: 8, sm: 12, md: 16, lg: 24, xl: 36 };

function resolveImageUrl(image: ImageRef | undefined, data: Data): string | undefined {
  if (!image) return undefined;
  if ("assetUrl" in image) return image.assetUrl || undefined;
  const v = data[image.field];
  return typeof v === "string" && v !== "" ? v : undefined;
}

/** Wrap a container's children in a positioned background (image + token overlay, §I). */
function withBackground(
  bg: BlockBackground,
  data: Data,
  pageFormat: string | undefined,
  inner: ReactNode,
  k: Key,
): ReactNode {
  const url = resolveImageUrl(bg.image, data);
  const minHeight =
    bg.minHeight === "page"
      ? `${getPageFormat(pageFormat).heightMm - 2 * getPageFormat(pageFormat).marginMm}mm`
      : bg.minHeight
        ? `${MINH_REM[bg.minHeight]}rem`
        : undefined;
  return (
    <div
      key={k}
      data-bg="true"
      style={{
        position: "relative",
        backgroundImage: url ? `url(${url})` : undefined,
        backgroundSize: bg.position ?? "cover",
        backgroundPosition: "center",
        minHeight,
        overflow: "hidden",
      }}
    >
      {bg.overlay ? (
        <div
          data-bg-overlay="true"
          style={{ position: "absolute", inset: 0, background: `var(--c-${bg.overlay.color})`, opacity: bg.overlay.opacity / 100 }}
        />
      ) : null}
      <div style={{ position: "relative" }}>{inner}</div>
    </div>
  );
}

/**
 * Safe layout interpreter (§C): a recursive `switch` over known block kinds. There
 * is NO code execution and NO raw-HTML injection — content is rendered as text,
 * data blocks reuse the registered render components, and styling is the compiled
 * token CSS only. Unknown kinds/props are skipped (never thrown), so a layout
 * authored against an older schema degrades gracefully.
 */
function renderBlock(block: Block, data: Data, theme: ThemeTokens, layoutType: string, pageFormat: string | undefined, k: Key): ReactNode {
  const style = compileBlockStyle(block.style);
  switch (block.kind) {
    case "heading":
      return (
        <div key={k} data-block="heading" style={{ fontFamily: "var(--f-heading)", ...style }}>
          {asText(data[block.field])}
        </div>
      );
    case "paragraph":
      return (
        <p key={k} data-block="paragraph" style={style}>
          {asText(data[block.field])}
        </p>
      );
    case "list":
      return (
        <ul key={k} data-block="list" style={style}>
          {asList(data[block.field]).map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );
    case "keyValue": {
      const fields = getSectionType(layoutType)?.fields ?? [];
      const labelFor = (key: string) => fields.find((f) => f.key === key)?.label ?? key;
      return (
        <dl key={k} data-block="keyValue" style={style}>
          {block.fields.map((fk) => (
            <div key={fk} data-kv={fk}>
              <dt>{labelFor(fk)}</dt>
              <dd>{asText(data[fk])}</dd>
            </div>
          ))}
        </dl>
      );
    }
    case "table":
      return (
        <div key={k} data-block="table" style={style}>
          <DataTable data={{ dataset: data[block.field] }} theme={theme} />
        </div>
      );
    case "chart":
      return (
        <div key={k} data-block="chart" style={style}>
          <ChartView data={{ dataset: data[block.field] }} theme={theme} kind={block.chart} />
        </div>
      );
    case "matrix":
      return (
        <div key={k} data-block="matrix" style={style}>
          <ComparisonMatrix data={{ matrix: data[block.field] }} theme={theme} />
        </div>
      );
    case "logo":
      return theme.logoUrl ? <img key={k} data-block="logo" src={theme.logoUrl} alt="" style={style} /> : null;
    case "divider":
      return <hr key={k} data-block="divider" style={{ borderColor: "var(--c-line)", ...style }} />;
    case "callout":
      return (
        <div key={k} data-block="callout" style={{ background: "var(--c-surface)", padding: spaceToken("md"), ...style }}>
          {block.text}
        </div>
      );
    case "text":
      return (
        <span key={k} data-block="text" style={style}>
          {block.text}
        </span>
      );
    case "stack": {
      const inner = (
        <div
          data-block="stack"
          style={{ display: "flex", flexDirection: "column", gap: block.gap ? spaceToken(block.gap) : undefined, ...style }}
        >
          {block.children.map((child, i) => renderBlock(child, data, theme, layoutType, pageFormat, i))}
        </div>
      );
      return block.background ? withBackground(block.background, data, pageFormat, inner, k) : <div key={k}>{inner}</div>;
    }
    case "columns": {
      const inner = (
        <div
          data-block="columns"
          style={{ display: "flex", flexDirection: "row", gap: block.gap ? spaceToken(block.gap) : undefined, ...style }}
        >
          {block.columns.map((col, i) => (
            <div key={i} data-column={i} style={{ flex: block.widths?.[i] ?? 1 }}>
              {col.map((child, j) => renderBlock(child, data, theme, layoutType, pageFormat, j))}
            </div>
          ))}
        </div>
      );
      return block.background ? withBackground(block.background, data, pageFormat, inner, k) : <div key={k}>{inner}</div>;
    }
    default:
      return null; // unknown kind — skip, never throw
  }
}

export function LayoutRenderer({
  layout,
  data,
  theme,
  pageFormat,
}: {
  layout: SectionLayout;
  data: Data;
  theme: ThemeTokens;
  pageFormat?: string;
}) {
  return (
    <div data-layout={`${layout.type}:${layout.variant}`}>
      {renderBlock(layout.root, data, theme, layout.type, pageFormat, "root")}
    </div>
  );
}
