import type { ProposalDocument, Template, ThemeTokens } from "@proposal/shared";

export interface ProposalSummary {
  id: string;
  title: string;
  client: string;
  folderId: string | null;
  updatedAt: string;
}
export interface StoredProposal {
  id: string;
  ownerId: string;
  document: ProposalDocument;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface ProposalVersion {
  id: string;
  proposalId: string;
  document: ProposalDocument;
  createdAt: string;
}
export interface StoredTheme {
  id: string;
  ownerId: string;
  tokens: ThemeTokens;
}
export interface TemplateRow {
  id: string;
  template: import("@proposal/shared").Template | null; // null = built-in deprecation overlay
  deprecated: boolean;
  updatedAt: string;
}
export interface StoredUser {
  id: string;
  email: string;
  passwordHash: string;
  isAdmin: boolean;
  disabled: boolean;
  createdAt: string;
}

/** Account fields safe to expose to the admin UI — never carries passwordHash. */
export interface UserSummary {
  id: string;
  email: string;
  isAdmin: boolean;
  disabled: boolean;
  createdAt: string;
}

/** Thrown by createUser when an account with the same (normalized) email exists. */
export class DuplicateEmailError extends Error {
  constructor(email: string) {
    super(`An account with email "${email}" already exists`);
    this.name = "DuplicateEmailError";
  }
}

export interface Folder {
  id: string;
  ownerId: string;
  name: string;
  createdAt: string;
}

export interface SectionTypeRow {
  type: string;
  definition: import("@proposal/shared").SectionTypeSchema | null;
  deprecated: boolean;
  updatedAt: string;
}

/**
 * Persistence boundary (§12). Two implementations: in-memory (tests + zero-config
 * local dev) and Postgres/Drizzle (when DATABASE_URL is set). Route handlers
 * depend on this interface, never on a concrete driver.
 */
export interface Repository {
  listProposals(ownerId: string): Promise<ProposalSummary[]>;
  createProposal(ownerId: string, document: ProposalDocument, folderId?: string | null): Promise<StoredProposal>;
  updateProposalMeta(id: string, patch: { title?: string; folderId?: string | null }): Promise<ProposalSummary | null>;
  duplicateProposal(ownerId: string, id: string): Promise<StoredProposal | null>;
  getProposal(id: string): Promise<StoredProposal | null>;
  /** Autosave: replace the document, bump updatedAt. Returns null if unknown. */
  saveProposal(id: string, document: ProposalDocument): Promise<StoredProposal | null>;
  deleteProposal(id: string): Promise<boolean>;

  listVersions(proposalId: string): Promise<ProposalVersion[]>;
  /** Capture the proposal's current document as an immutable version (export snapshot). */
  snapshotVersion(proposalId: string): Promise<ProposalVersion | null>;

  listThemes(ownerId: string): Promise<StoredTheme[]>;
  upsertTheme(ownerId: string, tokens: ThemeTokens): Promise<StoredTheme>;

  /** Builder (§11). Authored template rows; null template = built-in overlay. */
  listTemplateRows(): Promise<TemplateRow[]>;
  upsertTemplate(row: { id: string; template: Template | null; deprecated: boolean }): Promise<TemplateRow>;
  setTemplateDeprecated(id: string, deprecated: boolean): Promise<TemplateRow | null>;
  /** Distinct templateId referenced by any stored proposal (freeze check). */
  listInUseTemplateIds(): Promise<string[]>;

  /** Auth (§13.10). Accounts are admin-created; there is no public signup. */
  getUserByEmail(email: string): Promise<StoredUser | null>;
  getUserById(id: string): Promise<StoredUser | null>;
  /** @throws DuplicateEmailError if the normalized email already exists. */
  createUser(input: { email: string; passwordHash: string; isAdmin?: boolean }): Promise<StoredUser>;

  /** Builder user management (§11). Summaries never include passwordHash. */
  listUsers(): Promise<UserSummary[]>;
  setUserDisabled(id: string, disabled: boolean): Promise<UserSummary | null>;
  setUserAdmin(id: string, isAdmin: boolean): Promise<UserSummary | null>;
  setUserPassword(id: string, passwordHash: string): Promise<boolean>;
  countActiveAdmins(): Promise<number>;

  /** Builder (§11). Authored section-type rows; null definition = built-in overlay. */
  listSectionTypeRows(): Promise<SectionTypeRow[]>;
  upsertSectionType(row: { type: string; definition: SectionTypeRow["definition"]; deprecated: boolean }): Promise<SectionTypeRow>;
  setSectionTypeDeprecated(type: string, deprecated: boolean): Promise<SectionTypeRow | null>;
  /** Distinct section-type keys referenced by any stored proposal (freeze check). */
  listInUseTypeKeys(): Promise<string[]>;

  /** Folders (flat, one level). Deleting a folder unfiles its proposals (folderId → null). */
  listFolders(ownerId: string): Promise<Folder[]>;
  createFolder(ownerId: string, name: string): Promise<Folder>;
  renameFolder(ownerId: string, id: string, name: string): Promise<Folder | null>;
  deleteFolder(ownerId: string, id: string): Promise<boolean>;
}
