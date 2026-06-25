import type { ValidationError, ValidationResult } from "./result";
import type { FieldType, SectionTypeSchema } from "../types/section";
import {
  ALIGNS,
  CHART_KINDS,
  CONTAINER_KINDS,
  LEAF_KINDS,
  SIZE_SCALES,
  SPACE_SCALES,
  TOKEN_COLORS,
  TOKEN_FONTS,
  WEIGHTS,
} from "../types/layout";

const MAX_DEPTH = 4;

/** Which content field types each binding block accepts (§A). */
const BINDING_KINDS: Record<string, FieldType[]> = {
  heading: ["text", "paragraph"],
  paragraph: ["text", "paragraph"],
  list: ["list"],
  table: ["dataset"],
  chart: ["dataset"],
  matrix: ["matrix"],
  image: ["image"],
};

const STYLE_VOCAB: Record<string, readonly string[]> = {
  color: TOKEN_COLORS,
  background: TOKEN_COLORS,
  font: TOKEN_FONTS,
  size: SIZE_SCALES,
  weight: WEIGHTS,
  align: ALIGNS,
  padding: SPACE_SCALES,
};

/**
 * Meta-validate an authored SectionLayout against its section type (§B). Field
 * bindings are kind-checked; styling must be in-vocabulary; containers are bounded
 * (2–4 columns, depth ≤ 4). Errors use JSON-pointer-ish paths. The renderer also
 * degrades defensively, so this is the authoring gate, not the only line of defence.
 */
export function validateLayout(layout: unknown, typeSchema: SectionTypeSchema): ValidationResult {
  const errors: ValidationError[] = [];
  const push = (path: string, message: string) => errors.push({ path, message, source: "app" });
  const fieldType = (key: string): FieldType | undefined =>
    typeSchema.fields.find((f) => f.key === key)?.type;

  if (typeof layout !== "object" || layout === null) {
    return {
      valid: false,
      errors: [{ path: "", message: "Expected a layout object", source: "app" }],
    };
  }
  const lay = layout as { root?: unknown; template?: unknown };
  // Template layout: a non-empty string template is sufficient (css optional).
  if (typeof lay.template === "string") {
    if (lay.template.trim() === "") {
      return {
        valid: false,
        errors: [{ path: "/template", message: "template is empty", source: "app" }],
      };
    }
    return { valid: true, errors: [] };
  }
  const root = lay.root;
  if (root === undefined || root === null) {
    return {
      valid: false,
      errors: [{ path: "/root", message: "a template or a block root is required", source: "app" }],
    };
  }

  const validateStyle = (style: unknown, path: string) => {
    if (style === undefined) return;
    if (typeof style !== "object" || style === null) {
      push(path, "style must be an object");
      return;
    }
    for (const [prop, value] of Object.entries(style as Record<string, unknown>)) {
      const vocab = STYLE_VOCAB[prop];
      if (!vocab) {
        push(`${path}/${prop}`, `unknown style prop "${prop}"`);
      } else if (typeof value !== "string" || !vocab.includes(value)) {
        push(`${path}/${prop}`, `${prop} must be one of ${vocab.join(", ")}`);
      }
    }
  };

  const validateBackground = (bg: unknown, path: string) => {
    if (bg === undefined) return;
    if (typeof bg !== "object" || bg === null) {
      push(path, "background must be an object");
      return;
    }
    const b = bg as Record<string, unknown>;
    if (b["image"] !== undefined) {
      const img = b["image"] as Record<string, unknown>;
      if (typeof img !== "object" || img === null) {
        push(`${path}/image`, "image must be an object");
      } else if (typeof img["assetUrl"] === "string") {
        // fixed asset — ok
      } else if (typeof img["field"] === "string") {
        if (fieldType(img["field"]) !== "image") {
          push(`${path}/image/field`, `background image field must bind to an image field`);
        }
      } else {
        push(`${path}/image`, "image must have an assetUrl or a field");
      }
    }
    if (b["overlay"] !== undefined) {
      const ov = b["overlay"] as Record<string, unknown>;
      if (typeof ov !== "object" || ov === null) {
        push(`${path}/overlay`, "overlay must be an object");
      } else {
        if (typeof ov["color"] !== "string" || !TOKEN_COLORS.includes(ov["color"] as never)) {
          push(`${path}/overlay/color`, `overlay.color must be one of ${TOKEN_COLORS.join(", ")}`);
        }
        const op = ov["opacity"];
        if (typeof op !== "number" || !Number.isInteger(op) || op < 0 || op > 100) {
          push(`${path}/overlay/opacity`, "overlay.opacity must be an integer 0–100");
        }
      }
    }
    if (b["position"] !== undefined && b["position"] !== "cover" && b["position"] !== "contain") {
      push(`${path}/position`, 'position must be "cover" or "contain"');
    }
    if (
      b["minHeight"] !== undefined &&
      b["minHeight"] !== "page" &&
      !SIZE_SCALES.includes(b["minHeight"] as never)
    ) {
      push(`${path}/minHeight`, 'minHeight must be a size scale or "page"');
    }
  };

  const walk = (block: unknown, path: string, depth: number) => {
    if (depth > MAX_DEPTH) {
      push(path, `nesting depth exceeds ${MAX_DEPTH}`);
      return;
    }
    if (typeof block !== "object" || block === null) {
      push(path, "block must be an object");
      return;
    }
    const b = block as Record<string, unknown>;
    const kind = b["kind"];
    if (
      typeof kind !== "string" ||
      (!LEAF_KINDS.includes(kind as never) && !CONTAINER_KINDS.includes(kind as never))
    ) {
      push(`${path}/kind`, `unknown block kind "${String(kind)}"`);
      return;
    }
    validateStyle(b["style"], `${path}/style`);

    // Field-binding leaf blocks.
    if (kind in BINDING_KINDS) {
      const allowed = BINDING_KINDS[kind]!;
      const f = b["field"];
      if (typeof f !== "string") {
        push(`${path}/field`, `${kind} requires a field`);
      } else {
        const ft = fieldType(f);
        if (ft === undefined) push(`${path}/field`, `field "${f}" does not exist on this type`);
        else if (!allowed.includes(ft))
          push(`${path}/field`, `${kind} cannot bind to a ${ft} field`);
      }
      if (kind === "chart" && !CHART_KINDS.includes(b["chart"] as never)) {
        push(`${path}/chart`, `chart must be one of ${CHART_KINDS.join(", ")}`);
      }
      return;
    }
    if (kind === "keyValue") {
      const fields = b["fields"];
      if (!Array.isArray(fields) || fields.length === 0) {
        push(`${path}/fields`, "keyValue requires at least one field");
      } else {
        fields.forEach((f, i) => {
          const ft = typeof f === "string" ? fieldType(f) : undefined;
          if (ft !== "text" && ft !== "paragraph")
            push(`${path}/fields/${i}`, "keyValue fields must be text/paragraph");
        });
      }
      return;
    }
    if (kind === "callout" || kind === "text") {
      if (typeof b["text"] !== "string" || b["text"].trim() === "")
        push(`${path}/text`, `${kind} requires non-empty text`);
      return;
    }
    if (kind === "logo" || kind === "divider") return; // bind nothing

    // Containers.
    if (kind === "stack") {
      validateBackground(b["background"], `${path}/background`);
      const children = b["children"];
      if (!Array.isArray(children)) push(`${path}/children`, "stack requires a children array");
      else children.forEach((c, i) => walk(c, `${path}/children/${i}`, depth + 1));
      return;
    }
    if (kind === "columns") {
      validateBackground(b["background"], `${path}/background`);
      const cols = b["columns"];
      if (!Array.isArray(cols) || cols.length < 2 || cols.length > 4) {
        push(`${path}/columns`, "columns must have 2–4 columns");
      } else {
        const widths = b["widths"];
        if (widths !== undefined) {
          if (
            !Array.isArray(widths) ||
            widths.length !== cols.length ||
            widths.some((w) => typeof w !== "number" || w <= 0)
          ) {
            push(`${path}/widths`, "widths must match the column count and be positive");
          }
        }
        cols.forEach((col, i) => {
          if (!Array.isArray(col))
            push(`${path}/columns/${i}`, "each column must be an array of blocks");
          else col.forEach((c, j) => walk(c, `${path}/columns/${i}/${j}`, depth + 1));
        });
      }
      return;
    }
  };

  walk(root, "/root", 1);
  return { valid: errors.length === 0, errors };
}
