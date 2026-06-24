import { isSelectableModel, type GenerationModelId } from "@proposal/shared";
import type { ThemeTokens } from "@proposal/shared";
import type {
  Folder,
  ProposalSummary,
  ProposalVersion,
  Repository,
  SectionTypeRow,
  StoredProposal,
  StoredTheme,
  TemplateRow,
  StoredUser,
  UserSummary,
} from "./types";
import { DuplicateEmailError } from "./types";

const uid = (prefix: string) => `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
const now = () => new Date().toISOString();
const clone = <T>(value: T): T => structuredClone(value);
const toSummary = (u: StoredUser): UserSummary => ({
  id: u.id,
  email: u.email,
  isAdmin: u.isAdmin,
  disabled: u.disabled,
  createdAt: u.createdAt,
});
const toProposalSummary = (p: StoredProposal): ProposalSummary => ({
  id: p.id,
  title: p.document.title,
  client: p.document.client?.name ?? "",
  folderId: p.folderId,
  updatedAt: p.updatedAt,
});

/** In-memory repository — used by tests and as the zero-config local-dev default. */
export function createMemoryRepo(): Repository {
  const proposals = new Map<string, StoredProposal>();
  const versions = new Map<string, ProposalVersion[]>();
  const themes = new Map<string, StoredTheme>();
  const templates = new Map<string, TemplateRow>(); // keyed by template id
  const users = new Map<string, StoredUser>(); // keyed by lowercased email
  const sectionTypeRows = new Map<string, SectionTypeRow>();
  const folders = new Map<string, Folder>(); // keyed by folder id
  let aiModel: GenerationModelId | null = null;
  const sectionLayoutRows = new Map<string, import("@proposal/shared").SectionLayout>();
  const layoutKey = (type: string, variant: string, pageFormat: string) =>
    `${type}:${variant}:${pageFormat}`;

  return {
    async listProposals(ownerId) {
      return [...proposals.values()].filter((p) => p.ownerId === ownerId).map(toProposalSummary);
    },

    async createProposal(ownerId, document, folderId = null) {
      const id = uid("prop");
      const stored: StoredProposal = {
        id,
        ownerId,
        document: { ...clone(document), id },
        folderId,
        createdAt: now(),
        updatedAt: now(),
      };
      proposals.set(id, stored);
      return clone(stored);
    },

    async updateProposalMeta(id, patch) {
      const existing = proposals.get(id);
      if (!existing) return null;
      const document =
        patch.title !== undefined
          ? { ...clone(existing.document), title: patch.title }
          : existing.document;
      const updated: StoredProposal = {
        ...existing,
        document,
        folderId: patch.folderId !== undefined ? patch.folderId : existing.folderId,
      };
      proposals.set(id, updated);
      return toProposalSummary(updated);
    },

    async duplicateProposal(ownerId, id) {
      const src = proposals.get(id);
      if (!src || src.ownerId !== ownerId) return null;
      const newId = uid("prop");
      const stored: StoredProposal = {
        id: newId,
        ownerId,
        document: { ...clone(src.document), id: newId, title: `Copy of ${src.document.title}` },
        folderId: src.folderId,
        createdAt: now(),
        updatedAt: now(),
      };
      proposals.set(newId, stored);
      return clone(stored);
    },

    async getProposal(id) {
      const p = proposals.get(id);
      return p ? clone(p) : null;
    },

    async saveProposal(id, document) {
      const existing = proposals.get(id);
      if (!existing) return null;
      const updated: StoredProposal = {
        ...existing,
        document: { ...clone(document), id },
        updatedAt: now(),
      };
      proposals.set(id, updated);
      return clone(updated);
    },

    async deleteProposal(id) {
      versions.delete(id);
      return proposals.delete(id);
    },

    async listVersions(proposalId) {
      return clone(versions.get(proposalId) ?? []);
    },

    async snapshotVersion(proposalId) {
      const p = proposals.get(proposalId);
      if (!p) return null;
      const version: ProposalVersion = {
        id: uid("ver"),
        proposalId,
        document: clone(p.document),
        createdAt: now(),
      };
      versions.set(proposalId, [version, ...(versions.get(proposalId) ?? [])]);
      return clone(version);
    },

    async listThemes(ownerId) {
      return [...themes.values()].filter((t) => t.ownerId === ownerId).map(clone);
    },

    async upsertTheme(ownerId, tokens: ThemeTokens) {
      const stored: StoredTheme = { id: tokens.id, ownerId, tokens: clone(tokens) };
      themes.set(tokens.id, stored);
      return clone(stored);
    },

    async listTemplateRows() {
      return [...templates.values()].map(clone);
    },

    async upsertTemplate({ id, template, deprecated }) {
      const row: TemplateRow = {
        id,
        template: template ? clone(template) : null,
        deprecated,
        updatedAt: now(),
      };
      templates.set(id, row);
      return clone(row);
    },

    async setTemplateDeprecated(id, deprecated) {
      const existing = templates.get(id);
      if (!existing) {
        if (!deprecated) return null;
        const row: TemplateRow = { id, template: null, deprecated: true, updatedAt: now() };
        templates.set(id, row);
        return clone(row);
      }
      const row: TemplateRow = { ...existing, deprecated, updatedAt: now() };
      templates.set(id, row);
      return clone(row);
    },

    async listInUseTemplateIds() {
      const ids = new Set<string>();
      for (const p of proposals.values()) {
        if (p.document.templateId) ids.add(p.document.templateId);
      }
      return [...ids];
    },

    async getUserByEmail(email) {
      const user = users.get(email.trim().toLowerCase());
      return user ? clone(user) : null;
    },

    async getUserById(id) {
      for (const u of users.values()) if (u.id === id) return clone(u);
      return null;
    },

    async createUser({ email, passwordHash, isAdmin = false }) {
      const normalized = email.trim().toLowerCase();
      if (users.has(normalized)) throw new DuplicateEmailError(email);
      const stored: StoredUser = {
        id: uid("user"),
        email: normalized,
        passwordHash,
        isAdmin,
        disabled: false,
        createdAt: now(),
      };
      users.set(normalized, stored);
      return clone(stored);
    },

    async listUsers() {
      return [...users.values()]
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map(toSummary);
    },

    async setUserDisabled(id, disabled) {
      for (const u of users.values()) {
        if (u.id !== id) continue;
        const updated: StoredUser = { ...u, disabled };
        users.set(u.email, updated);
        return toSummary(updated);
      }
      return null;
    },

    async setUserAdmin(id, isAdmin) {
      for (const u of users.values()) {
        if (u.id !== id) continue;
        const updated: StoredUser = { ...u, isAdmin };
        users.set(u.email, updated);
        return toSummary(updated);
      }
      return null;
    },

    async setUserPassword(id, passwordHash) {
      for (const u of users.values()) {
        if (u.id !== id) continue;
        users.set(u.email, { ...u, passwordHash });
        return true;
      }
      return false;
    },

    async countActiveAdmins() {
      let n = 0;
      for (const u of users.values()) if (u.isAdmin && !u.disabled) n++;
      return n;
    },

    async listSectionTypeRows() {
      return [...sectionTypeRows.values()].map(clone);
    },

    async upsertSectionType({ type, definition, deprecated }) {
      const row: SectionTypeRow = {
        type,
        definition: definition ? clone(definition) : null,
        deprecated,
        updatedAt: now(),
      };
      sectionTypeRows.set(type, row);
      return clone(row);
    },

    async setSectionTypeDeprecated(type, deprecated) {
      const existing = sectionTypeRows.get(type);
      if (!existing) {
        if (!deprecated) return null;
        const row: SectionTypeRow = { type, definition: null, deprecated: true, updatedAt: now() };
        sectionTypeRows.set(type, row);
        return clone(row);
      }
      const row: SectionTypeRow = { ...existing, deprecated, updatedAt: now() };
      sectionTypeRows.set(type, row);
      return clone(row);
    },

    async listInUseTypeKeys() {
      const keys = new Set<string>();
      for (const p of proposals.values()) {
        for (const s of p.document.sections) keys.add(s.type);
      }
      return [...keys];
    },

    async listFolders(ownerId) {
      return [...folders.values()]
        .filter((f) => f.ownerId === ownerId)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(clone);
    },

    async createFolder(ownerId, name) {
      const folder: Folder = { id: uid("fld"), ownerId, name: name.trim(), createdAt: now() };
      folders.set(folder.id, folder);
      return clone(folder);
    },

    async renameFolder(ownerId, id, name) {
      const f = folders.get(id);
      if (!f || f.ownerId !== ownerId) return null;
      const updated: Folder = { ...f, name: name.trim() };
      folders.set(id, updated);
      return clone(updated);
    },

    async deleteFolder(ownerId, id) {
      const f = folders.get(id);
      if (!f || f.ownerId !== ownerId) return false;
      folders.delete(id);
      for (const [pid, p] of proposals) {
        if (p.folderId === id && p.ownerId === ownerId)
          proposals.set(pid, { ...p, folderId: null });
      }
      return true;
    },

    async getAiModel() {
      return isSelectableModel(aiModel) ? aiModel : null;
    },

    async setAiModel(model) {
      aiModel = model;
    },

    async listSectionLayouts() {
      return [...sectionLayoutRows.values()].map(clone);
    },
    async upsertSectionLayout(layout) {
      sectionLayoutRows.set(
        layoutKey(layout.type, layout.variant, layout.pageFormat),
        clone(layout),
      );
      return clone(layout);
    },
    async deleteSectionLayout(type, variant, pageFormat) {
      return sectionLayoutRows.delete(layoutKey(type, variant, pageFormat));
    },
  };
}
