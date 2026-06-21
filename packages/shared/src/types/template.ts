import type { FieldSchema } from "./section";

/**
 * Template structure + locks (§14.1, §7).
 *
 * NOTE ON NAMING: `Slot.kind` ("fixed" | "choice") is a different axis from
 * `SlotLock` ("fixed" | ...). A `kind: "fixed"` slot is a single-type slot; its
 * `lock` independently says how editable that slot's fields are. So
 * `{ kind: "fixed", lock: "editable-copy" }` is not a contradiction.
 *
 * These types are declared in slice 1 for completeness, but templates are only
 * VALIDATED/ENFORCED at runtime from slice 7 — slice 1's validation point covers
 * the ProposalDocument + section content only.
 */

export type SlotLock = "open" | "fixed" | "editable-copy" | "editable-data";

export type Slot =
  | {
      kind: "fixed";
      type: string;
      variant?: string;
      lock: SlotLock;
      /**
       * Canonical content for this slot. For `lock: "fixed"` these are the
       * immutable values (§7.2 fixed fields) the export gate compares against;
       * for editable locks they seed the initial (blank) section.
       */
      data?: Record<string, unknown>;
    }
  | { kind: "choice"; allowed: string[]; default: string; lock: "choice" };

export interface Template {
  id: string;
  name: string;
  themeId: string;
  /** Structure read-only downstream (§7.1). */
  locked: boolean;
  slots: Slot[];
  /**
   * Thin per-template patches over base field schemas (§5.2):
   * overrides[type][fieldKey] patches the base schema for THIS template only.
   */
  overrides?: Record<string, Partial<Record<string, FieldSchema>>>;
  /** Hidden from the picker but still resolvable for existing proposals (§11 Builder). */
  deprecated?: boolean;
}
