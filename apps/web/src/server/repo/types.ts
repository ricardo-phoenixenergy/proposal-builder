import type { GenerationModelId, ProposalDocument, Template, ThemeTokens } from "@proposal/shared";

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
  /** Soft-delete (4a): null = live; ISO timestamp = in the trash, recoverable. */
  deletedAt: string | null;
  /** Owning workspace (Theme 1). Populated on write; reads are still owner-scoped
   *  in 1a (shadow data) until the 1b cutover. Nullable until backfill is verified. */
  workspaceId: string | null;
}

/** Workspace roles (Theme 1/2). Enforced server-side in Theme 2. */
export type WorkspaceRole = "admin" | "editor" | "viewer";
export interface Workspace {
  id: string;
  name: string;
  createdAt: string;
}
export interface WorkspaceMembership {
  workspace: Workspace;
  role: WorkspaceRole;
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
  workspaceId: string | null;
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

/** A recorded audit event (Theme 3). */
export interface AuditEvent {
  id: string;
  workspaceId: string | null;
  actorUserId: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
}
/** Fields supplied when recording an event; id/createdAt are assigned by the repo. */
export interface AuditEventInput {
  workspaceId?: string | null;
  actorUserId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  detail?: Record<string, unknown>;
}

export interface Folder {
  id: string;
  ownerId: string;
  name: string;
  createdAt: string;
  workspaceId: string | null;
}

/** A client share link (2b). `token` is the unguessable public capability. */
export interface ShareLink {
  token: string;
  proposalId: string;
  workspaceId: string | null;
  createdBy: string;
  /** Whether holders of this link may download the proposal as a PDF. */
  allowExport: boolean;
  /** ISO timestamp; null = never expires. */
  expiresAt: string | null;
  /** ISO timestamp; null = active. Set = dead (revocable kill-switch). */
  revokedAt: string | null;
  /** ISO timestamp of the most recent view; null until first viewed. */
  lastViewedAt: string | null;
  createdAt: string;
}
/** Fields supplied when minting a link; token/createdAt are assigned by the repo. */
export interface ShareLinkInput {
  proposalId: string;
  workspaceId: string | null;
  createdBy: string;
  allowExport?: boolean;
  expiresAt?: string | null;
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
  createProposal(
    ownerId: string,
    document: ProposalDocument,
    folderId?: string | null,
  ): Promise<StoredProposal>;
  updateProposalMeta(
    id: string,
    patch: { title?: string; folderId?: string | null },
  ): Promise<ProposalSummary | null>;
  duplicateProposal(ownerId: string, id: string): Promise<StoredProposal | null>;
  getProposal(id: string): Promise<StoredProposal | null>;
  /** Autosave: replace the document, bump updatedAt. Returns null if unknown. */
  saveProposal(id: string, document: ProposalDocument): Promise<StoredProposal | null>;
  /** Soft-delete: move to the trash (sets deletedAt). False if unknown/already trashed. */
  deleteProposal(id: string): Promise<boolean>;
  /** Trash listing: proposals the owner has soft-deleted, most-recent first. */
  listTrashedProposals(ownerId: string): Promise<ProposalSummary[]>;
  /** Bring a trashed proposal back (clears deletedAt). False if unknown/not trashed. */
  restoreProposal(id: string): Promise<boolean>;
  /** Permanently delete a proposal AND its versions (hard delete). False if unknown. */
  purgeProposal(id: string): Promise<boolean>;
  /** Scheduled cleanup: hard-delete all trash whose deletedAt is before `olderThan`.
   *  Returns the number of proposals purged (their versions go too). */
  purgeExpiredTrash(olderThan: Date): Promise<number>;

  listVersions(proposalId: string): Promise<ProposalVersion[]>;
  /** Capture the proposal's current document as an immutable version (export snapshot). */
  snapshotVersion(proposalId: string): Promise<ProposalVersion | null>;

  listThemes(ownerId: string): Promise<StoredTheme[]>;
  upsertTheme(ownerId: string, tokens: ThemeTokens): Promise<StoredTheme>;

  /** Builder (§11). Authored template rows; null template = built-in overlay. */
  listTemplateRows(): Promise<TemplateRow[]>;
  upsertTemplate(row: {
    id: string;
    template: Template | null;
    deprecated: boolean;
  }): Promise<TemplateRow>;
  setTemplateDeprecated(id: string, deprecated: boolean): Promise<TemplateRow | null>;
  /** Distinct templateId referenced by any stored proposal (freeze check). */
  listInUseTemplateIds(): Promise<string[]>;

  /** Auth (§13.10). Accounts are admin-created; there is no public signup. */
  getUserByEmail(email: string): Promise<StoredUser | null>;
  getUserById(id: string): Promise<StoredUser | null>;
  /** @throws DuplicateEmailError if the normalized email already exists. */
  createUser(input: {
    email: string;
    passwordHash: string;
    isAdmin?: boolean;
  }): Promise<StoredUser>;

  /** Builder user management (§11). Summaries never include passwordHash. */
  listUsers(): Promise<UserSummary[]>;
  setUserDisabled(id: string, disabled: boolean): Promise<UserSummary | null>;
  setUserAdmin(id: string, isAdmin: boolean): Promise<UserSummary | null>;
  /** Apply isAdmin and/or disabled in a single atomic update. Null if unknown. */
  patchUser(
    id: string,
    change: { isAdmin?: boolean; disabled?: boolean },
  ): Promise<UserSummary | null>;
  setUserPassword(id: string, passwordHash: string): Promise<boolean>;
  countActiveAdmins(): Promise<number>;

  /** Workspaces a user belongs to, with their role (Theme 1). */
  listUserWorkspaces(userId: string): Promise<WorkspaceMembership[]>;
  /** Whether a user is a member of a workspace — the 1b access-control check. */
  isWorkspaceMember(workspaceId: string, userId: string): Promise<boolean>;
  /** The user's role in a workspace, or null if not a member (Theme 2 RBAC). */
  getWorkspaceRole(workspaceId: string, userId: string): Promise<WorkspaceRole | null>;
  /** Add or update a member's role in a workspace (idempotent upsert, Theme 2). */
  addWorkspaceMember(workspaceId: string, userId: string, role: WorkspaceRole): Promise<void>;

  /** Client share links (2b). */
  createShareLink(input: ShareLinkInput): Promise<ShareLink>;
  /** All links for a proposal (newest first), including revoked/expired (for the manager UI). */
  listShareLinks(proposalId: string): Promise<ShareLink[]>;
  /** Resolve a link by its token, or null if unknown. State checks live in the caller. */
  getShareLink(token: string): Promise<ShareLink | null>;
  /** Revoke a link (sets revokedAt). False if unknown or already revoked. */
  revokeShareLink(token: string): Promise<boolean>;
  /** Best-effort: stamp lastViewedAt on a successful view. */
  touchShareLink(token: string): Promise<void>;

  /** Append an audit event (Theme 3). */
  recordAuditEvent(event: AuditEventInput): Promise<void>;
  /** Audit events for a workspace, newest first (admin view). */
  listAuditEvents(workspaceId: string, opts?: { limit?: number }): Promise<AuditEvent[]>;

  /** Builder (§11). Authored section-type rows; null definition = built-in overlay. */
  listSectionTypeRows(): Promise<SectionTypeRow[]>;
  upsertSectionType(row: {
    type: string;
    definition: SectionTypeRow["definition"];
    deprecated: boolean;
  }): Promise<SectionTypeRow>;
  setSectionTypeDeprecated(type: string, deprecated: boolean): Promise<SectionTypeRow | null>;
  /** Distinct section-type keys referenced by any stored proposal (freeze check). */
  listInUseTypeKeys(): Promise<string[]>;

  /** Folders (flat, one level). Deleting a folder unfiles its proposals (folderId → null). */
  listFolders(ownerId: string): Promise<Folder[]>;
  createFolder(ownerId: string, name: string): Promise<Folder>;
  renameFolder(ownerId: string, id: string, name: string): Promise<Folder | null>;
  deleteFolder(ownerId: string, id: string): Promise<boolean>;

  /** App-wide AI model setting (admin-configured, §10). null when unset. */
  getAiModel(): Promise<GenerationModelId | null>;
  setAiModel(model: GenerationModelId): Promise<void>;

  /** Authored section layouts (§D). Global; identity = (type, variant, pageFormat). */
  listSectionLayouts(): Promise<import("@proposal/shared").SectionLayout[]>;
  upsertSectionLayout(
    layout: import("@proposal/shared").SectionLayout,
  ): Promise<import("@proposal/shared").SectionLayout>;
  deleteSectionLayout(type: string, variant: string, pageFormat: string): Promise<boolean>;
}
