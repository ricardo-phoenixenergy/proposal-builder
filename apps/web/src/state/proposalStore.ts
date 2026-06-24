import { create } from "zustand";
import { temporal } from "zundo";
import type {
  ProposalDocument,
  SectionLayout,
  SectionTypeSchema,
  Template,
  ThemeTokens,
} from "@proposal/shared";
import {
  applyTemplate,
  builtInTemplates,
  sampleProposal,
  setActiveSectionTypes,
  setActiveLayouts,
} from "@proposal/shared";
import { defaultTheme } from "../theme/defaultTheme";
import { themes } from "../theme/themes";
import {
  setSectionVariant,
  setSectionData,
  setSectionType,
  appendSection,
  insertSection,
  removeSection,
  setSectionPageBreak,
} from "./mutations";
import * as persistence from "../client/persistence";
import { fetchSectionTypes } from "../client/sectionTypes";
import { fetchLayouts } from "../client/layouts";
import { fetchTemplates } from "../client/templates";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export type NotificationKind = "error" | "success" | "info";
export interface Notification {
  id: number;
  kind: NotificationKind;
  message: string;
}

let notificationSeq = 0;

/**
 * The single source of truth (CLAUDE.md): proposal JSON + theme + selection +
 * generation settings. Actions are thin wrappers over pure mutations.
 */
export interface ProposalState {
  document: ProposalDocument;
  theme: ThemeTokens;
  selectedId: string | null;
  /** Persisted proposal id (null until saved to the backend). */
  proposalId: string | null;
  saveStatus: SaveStatus;
  /** Transient user-facing notices (errors, generation/upload status). */
  notifications: Notification[];
  notify: (kind: NotificationKind, message: string) => void;
  dismiss: (id: number) => void;
  setTheme: (theme: ThemeTokens) => void;
  /** Clone the active theme into document.theme (editable custom theme). */
  forkTheme: () => void;
  /** Drop document.theme and revert to the preset referenced by themeId. */
  unforkTheme: () => void;
  /** Pick a preset by id; clears any fork. */
  selectPreset: (presetId: string) => void;
  selectSection: (id: string | null) => void;
  setVariant: (sectionId: string, variant: string) => void;
  setSectionData: (sectionId: string, data: Record<string, unknown>) => void;
  setSectionType: (sectionId: string, type: string) => void;
  setBrief: (brief: string) => void;
  /** Load a template: scaffold a fresh document and pin its theme (§7). */
  applyTemplate: (templateId: string) => void;
  /** Persist the current document as a new proposal; adopt its server id. */
  persistNew: () => Promise<void>;
  /** Autosave the current document (PUT) if it's already persisted. */
  saveNow: () => Promise<void>;
  /** Load a persisted proposal into the editor. */
  load: (id: string) => Promise<void>;
  /** Active section types (built-ins + authored, hydrated from the API). */
  sectionTypes: SectionTypeSchema[];
  /** Fetch section types from the API and hydrate the shared registry. */
  loadSectionTypes: () => Promise<void>;
  /** Active authored layouts (hydrated from the API into the shared registry). */
  layouts: SectionLayout[];
  /** Fetch layouts from the API and hydrate the shared registry. */
  loadLayouts: () => Promise<void>;
  /** Append a new section of the given type to the current document. */
  addSection: (type: string) => void;
  /** Insert a new section of `type` at `index` and select it. */
  insertSection: (type: string, index: number) => void;
  /** Remove a section; clears the selection if it was the removed one. */
  removeSection: (id: string) => void;
  /** Toggle a section's manual page break. */
  setPageBreakBefore: (sectionId: string, value: boolean) => void;
  /** Set the document page format (§J). */
  setPageFormat: (id: string) => void;
  /** Set the document render mode (§J). */
  setPageMode: (mode: "report" | "slides") => void;
  /** Active templates (built-ins + authored, hydrated from the API). */
  templates: Template[];
  /** Fetch the merged template list from the API into the store. */
  loadTemplates: () => Promise<void>;
}

function themeById(id: string): ThemeTokens {
  return themes.find((t) => t.id === id) ?? defaultTheme;
}

/**
 * Debounce delay for undo history snapshots.
 * Set to 0 in test environment for synchronous, deterministic behaviour.
 */
const HISTORY_DEBOUNCE_MS = process.env.NODE_ENV === "test" ? 0 : 300;

/**
 * Wraps a zundo internal handleSet callback with optional debouncing.
 * When ms <= 0, returns fn unchanged (synchronous passthrough — used in tests).
 *
 * Typed with a constrained generic so lint (no-explicit-any) stays clean.
 * The zundo `handleSet` option passes its internal `_handleSet` at runtime;
 * the declared type is `StoreApi<TState>['setState']` which differs — we
 * capture the actual function type via the generic `T` to remain flexible.
 */
function debounceHistory<T extends (...args: Parameters<T>) => ReturnType<T>>(
  fn: T,
  ms: number,
): T {
  if (ms <= 0) return fn;
  let t: ReturnType<typeof setTimeout> | undefined;
  return ((...args: Parameters<T>) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  }) as T;
}

export const useProposalStore = create<ProposalState>()(
  temporal(
    (set, get) => ({
      document: sampleProposal,
      theme: defaultTheme,
      selectedId: sampleProposal.sections[0]?.id ?? null,
      proposalId: null,
      saveStatus: "idle",
      notifications: [],
      notify: (kind, message) =>
        set((state) => ({
          notifications: [...state.notifications, { id: ++notificationSeq, kind, message }],
        })),
      dismiss: (id) =>
        set((state) => ({ notifications: state.notifications.filter((n) => n.id !== id) })),
      setTheme: (theme) =>
        set((state) =>
          state.document.theme ? { theme, document: { ...state.document, theme } } : { theme },
        ),
      forkTheme: () =>
        set((state) => {
          const forked = {
            ...state.theme,
            id: "custom",
            name: `Custom (from ${state.theme.name})`,
          };
          return { theme: forked, document: { ...state.document, theme: forked } };
        }),
      unforkTheme: () =>
        set((state) => {
          const { theme: _omit, ...rest } = state.document;
          return { theme: themeById(state.document.themeId), document: rest };
        }),
      selectPreset: (presetId) =>
        set((state) => {
          const { theme: _omit, ...rest } = state.document;
          return { theme: themeById(presetId), document: { ...rest, themeId: presetId } };
        }),
      selectSection: (selectedId) => set({ selectedId }),
      setVariant: (sectionId, variant) =>
        set((state) => ({ document: setSectionVariant(state.document, sectionId, variant) })),
      setSectionData: (sectionId, data) =>
        set((state) => ({ document: setSectionData(state.document, sectionId, data) })),
      setSectionType: (sectionId, type) =>
        set((state) => ({ document: setSectionType(state.document, sectionId, type) })),
      setBrief: (brief) => set((state) => ({ document: { ...state.document, brief } })),
      applyTemplate: (templateId) => {
        const template = get().templates.find((t) => t.id === templateId);
        if (!template) return;
        const document = applyTemplate(template);
        set({
          document,
          theme: themeById(template.themeId),
          selectedId: document.sections[0]?.id ?? null,
        });
      },
      persistNew: async () => {
        set({ saveStatus: "saving" });
        try {
          const { id, document } = await persistence.createProposal(get().document);
          set({ proposalId: id, document, saveStatus: "saved" });
          useProposalStore.temporal.getState().clear();
          get().notify("success", "Saved to cloud.");
        } catch {
          set({ saveStatus: "error" });
          get().notify("error", "Couldn't save to cloud. Check your connection and try again.");
        }
      },
      saveNow: async () => {
        const { proposalId, document } = get();
        if (!proposalId) return;
        set({ saveStatus: "saving" });
        try {
          await persistence.saveProposal(proposalId, document);
          set({ saveStatus: "saved" });
        } catch {
          set({ saveStatus: "error" });
          get().notify("error", "Autosave failed — your latest edits aren't saved yet.");
        }
      },
      load: async (id) => {
        const document = await persistence.loadProposal(id);
        set({
          document,
          theme: document.theme ?? themeById(document.themeId),
          proposalId: id,
          selectedId: document.sections[0]?.id ?? null,
          saveStatus: "saved",
        });
        useProposalStore.temporal.getState().clear();
      },
      sectionTypes: [],
      loadSectionTypes: async () => {
        try {
          const types = await fetchSectionTypes();
          setActiveSectionTypes(types); // hydrate the shared registry used by renderer/inspector
          set({ sectionTypes: types });
        } catch {
          get().notify("error", "Couldn't load section types.");
        }
      },
      layouts: [],
      loadLayouts: async () => {
        try {
          const layouts = await fetchLayouts();
          setActiveLayouts(layouts); // hydrate the shared registry used by resolveSection
          set({ layouts });
        } catch {
          get().notify("error", "Couldn't load layouts.");
        }
      },
      addSection: (type) => set((state) => ({ document: appendSection(state.document, type) })),
      insertSection: (type, index) =>
        set((state) => {
          const document = insertSection(state.document, type, index);
          const at = Math.max(0, Math.min(index, state.document.sections.length));
          return { document, selectedId: document.sections[at]?.id ?? state.selectedId };
        }),
      removeSection: (id) =>
        set((state) => ({
          document: removeSection(state.document, id),
          selectedId: state.selectedId === id ? null : state.selectedId,
        })),
      setPageBreakBefore: (sectionId, value) =>
        set((state) => ({ document: setSectionPageBreak(state.document, sectionId, value) })),
      setPageFormat: (id) => set((state) => ({ document: { ...state.document, pageFormat: id } })),
      setPageMode: (mode) => set((state) => ({ document: { ...state.document, pageMode: mode } })),
      templates: builtInTemplates,
      loadTemplates: async () => {
        try {
          set({ templates: await fetchTemplates() });
        } catch {
          get().notify("error", "Couldn't load templates.");
        }
      },
    }),
    {
      partialize: (state) => ({ document: state.document, selectedId: state.selectedId }),
      limit: 100,
      handleSet: (handleSet) => debounceHistory(handleSet, HISTORY_DEBOUNCE_MS),
      /**
       * Only a `document` change creates an undo step. `selectedId` is still
       * tracked (partialize) so it rides along in each snapshot — undoing a
       * content change restores the selection that was active at that time —
       * but a *pure* selection change (clicking another section) must NOT be
       * its own undo step, nor must a `saveStatus` update. Hence we gate on
       * the document reference only.
       */
      equality: (a, b) => a.document === b.document,
    },
  ),
);
