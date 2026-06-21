import { create } from "zustand";
import type { GenerationModelId, ProposalDocument, SectionTypeSchema, Template, ThemeTokens } from "@proposal/shared";
import { DEFAULT_MODEL, applyTemplate, builtInTemplates, sampleProposal, setActiveSectionTypes } from "@proposal/shared";
import { defaultTheme } from "../theme/defaultTheme";
import { themes } from "../theme/themes";
import { setSectionVariant, setSectionData, setSectionType, appendSection, insertSection, removeSection } from "./mutations";
import * as persistence from "../client/persistence";
import { fetchSectionTypes } from "../client/sectionTypes";
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
  model: GenerationModelId;
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
  setModel: (model: GenerationModelId) => void;
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
  /** Append a new section of the given type to the current document. */
  addSection: (type: string) => void;
  /** Insert a new section of `type` at `index` and select it. */
  insertSection: (type: string, index: number) => void;
  /** Remove a section; clears the selection if it was the removed one. */
  removeSection: (id: string) => void;
  /** Active templates (built-ins + authored, hydrated from the API). */
  templates: Template[];
  /** Fetch the merged template list from the API into the store. */
  loadTemplates: () => Promise<void>;
}

function themeById(id: string): ThemeTokens {
  return themes.find((t) => t.id === id) ?? defaultTheme;
}

export const useProposalStore = create<ProposalState>((set, get) => ({
  document: sampleProposal,
  theme: defaultTheme,
  selectedId: sampleProposal.sections[0]?.id ?? null,
  model: DEFAULT_MODEL,
  proposalId: null,
  saveStatus: "idle",
  notifications: [],
  notify: (kind, message) =>
    set((state) => ({ notifications: [...state.notifications, { id: ++notificationSeq, kind, message }] })),
  dismiss: (id) => set((state) => ({ notifications: state.notifications.filter((n) => n.id !== id) })),
  setTheme: (theme) =>
    set((state) => (state.document.theme ? { theme, document: { ...state.document, theme } } : { theme })),
  forkTheme: () =>
    set((state) => {
      const forked = { ...state.theme, id: "custom", name: `Custom (from ${state.theme.name})` };
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
  setModel: (model) => set({ model }),
  setBrief: (brief) => set((state) => ({ document: { ...state.document, brief } })),
  applyTemplate: (templateId) => {
    const template = get().templates.find((t) => t.id === templateId);
    if (!template) return;
    const document = applyTemplate(template);
    set({ document, theme: themeById(template.themeId), selectedId: document.sections[0]?.id ?? null });
  },
  persistNew: async () => {
    set({ saveStatus: "saving" });
    try {
      const { id, document } = await persistence.createProposal(get().document);
      set({ proposalId: id, document, saveStatus: "saved" });
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
  templates: builtInTemplates,
  loadTemplates: async () => {
    try {
      set({ templates: await fetchTemplates() });
    } catch {
      get().notify("error", "Couldn't load templates.");
    }
  },
}));
