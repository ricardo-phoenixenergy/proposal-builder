import { and, desc, eq, sql } from "drizzle-orm";
import type { ProposalDocument, Template, ThemeTokens } from "@proposal/shared";
import { getDb } from "../db/client";
import { proposalVersions, proposals, sectionTypeRows, templates, themes, users } from "../db/schema";
import type { Repository, SectionTypeRow, StoredProposal, UserSummary } from "./types";
import { DuplicateEmailError } from "./types";

const uid = (prefix: string) => `${prefix}_${crypto.randomUUID().slice(0, 8)}`;

type ProposalRow = typeof proposals.$inferSelect;
function toStored(row: ProposalRow): StoredProposal {
  return {
    id: row.id,
    ownerId: row.ownerId,
    document: row.document,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

type UserRow = typeof users.$inferSelect;
const toUserSummary = (r: UserRow): UserSummary => ({
  id: r.id,
  email: r.email,
  isAdmin: r.isAdmin,
  disabled: r.disabled,
  createdAt: r.createdAt.toISOString(),
});

/** Postgres/Drizzle repository (Neon). Active when DATABASE_URL is set. */
export function createPostgresRepo(): Repository {
  const db = getDb();

  return {
    async listProposals(ownerId) {
      const rows = await db.select().from(proposals).where(eq(proposals.ownerId, ownerId));
      return rows.map((r) => ({ id: r.id, title: r.document.title, updatedAt: r.updatedAt.toISOString() }));
    },

    async createProposal(ownerId, document) {
      const id = uid("prop");
      const [row] = await db
        .insert(proposals)
        .values({ id, ownerId, document: { ...document, id } })
        .returning();
      return toStored(row!);
    },

    async getProposal(id) {
      const [row] = await db.select().from(proposals).where(eq(proposals.id, id));
      return row ? toStored(row) : null;
    },

    async saveProposal(id, document) {
      const [row] = await db
        .update(proposals)
        .set({ document: { ...document, id }, updatedAt: new Date() })
        .where(eq(proposals.id, id))
        .returning();
      return row ? toStored(row) : null;
    },

    async deleteProposal(id) {
      await db.delete(proposalVersions).where(eq(proposalVersions.proposalId, id));
      const deleted = await db.delete(proposals).where(eq(proposals.id, id)).returning();
      return deleted.length > 0;
    },

    async listVersions(proposalId) {
      const rows = await db
        .select()
        .from(proposalVersions)
        .where(eq(proposalVersions.proposalId, proposalId))
        .orderBy(desc(proposalVersions.createdAt));
      return rows.map((r) => ({
        id: r.id,
        proposalId: r.proposalId,
        document: r.document,
        createdAt: r.createdAt.toISOString(),
      }));
    },

    async snapshotVersion(proposalId) {
      const current = await this.getProposal(proposalId);
      if (!current) return null;
      const [row] = await db
        .insert(proposalVersions)
        .values({ id: uid("ver"), proposalId, document: current.document })
        .returning();
      return { id: row!.id, proposalId, document: row!.document, createdAt: row!.createdAt.toISOString() };
    },

    async listThemes(ownerId) {
      const rows = await db.select().from(themes).where(eq(themes.ownerId, ownerId));
      return rows.map((r) => ({ id: r.id, ownerId: r.ownerId, tokens: r.tokens }));
    },

    async upsertTheme(ownerId, tokens: ThemeTokens) {
      const [row] = await db
        .insert(themes)
        .values({ id: tokens.id, ownerId, tokens })
        .onConflictDoUpdate({ target: themes.id, set: { ownerId, tokens } })
        .returning();
      return { id: row!.id, ownerId: row!.ownerId, tokens: row!.tokens };
    },

    async listTemplateRows() {
      const rows = await db.select().from(templates);
      return rows.map((r) => ({
        id: r.id,
        template: r.template ?? null,
        deprecated: r.deprecated,
        updatedAt: r.updatedAt.toISOString(),
      }));
    },

    async upsertTemplate({ id, template, deprecated }) {
      const [row] = await db
        .insert(templates)
        .values({ id, template: template ?? null, deprecated })
        .onConflictDoUpdate({ target: templates.id, set: { template: template ?? null, deprecated, updatedAt: new Date() } })
        .returning();
      return { id: row!.id, template: row!.template ?? null, deprecated: row!.deprecated, updatedAt: row!.updatedAt.toISOString() };
    },

    async setTemplateDeprecated(id, deprecated) {
      const [existing] = await db.select().from(templates).where(eq(templates.id, id));
      if (!existing) {
        if (!deprecated) return null;
        const [row] = await db.insert(templates).values({ id, template: null, deprecated: true }).returning();
        return { id: row!.id, template: row!.template ?? null, deprecated: row!.deprecated, updatedAt: row!.updatedAt.toISOString() };
      }
      const [row] = await db
        .update(templates)
        .set({ deprecated, updatedAt: new Date() })
        .where(eq(templates.id, id))
        .returning();
      return { id: row!.id, template: row!.template ?? null, deprecated: row!.deprecated, updatedAt: row!.updatedAt.toISOString() };
    },

    async listInUseTemplateIds() {
      const rows = await db.execute<{ id: string }>(
        sql`SELECT DISTINCT document->>'templateId' AS id FROM proposals WHERE document ? 'templateId'`,
      );
      return ((rows as unknown as { rows?: { id: string }[] }).rows ?? (rows as unknown as { id: string }[]))
        .map((r: { id: string }) => r.id)
        .filter(Boolean);
    },

    async getUserByEmail(email) {
      const [row] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase()));
      return row
        ? { id: row.id, email: row.email, passwordHash: row.passwordHash, isAdmin: row.isAdmin, disabled: row.disabled, createdAt: row.createdAt.toISOString() }
        : null;
    },

    async createUser({ email, passwordHash, isAdmin = false }) {
      try {
        const [row] = await db
          .insert(users)
          .values({ id: uid("user"), email: email.trim().toLowerCase(), passwordHash, isAdmin })
          .returning();
        return { id: row!.id, email: row!.email, passwordHash: row!.passwordHash, isAdmin: row!.isAdmin, disabled: row!.disabled, createdAt: row!.createdAt.toISOString() };
      } catch (e) {
        if ((e as { code?: string }).code === "23505") throw new DuplicateEmailError(email.trim().toLowerCase());
        throw e;
      }
    },

    async getUserById(id) {
      const [row] = await db.select().from(users).where(eq(users.id, id));
      return row
        ? { id: row.id, email: row.email, passwordHash: row.passwordHash, isAdmin: row.isAdmin, disabled: row.disabled, createdAt: row.createdAt.toISOString() }
        : null;
    },

    async listUsers() {
      const rows = await db.select().from(users).orderBy(users.createdAt);
      return rows.map(toUserSummary);
    },

    async setUserDisabled(id, disabled) {
      const [row] = await db.update(users).set({ disabled }).where(eq(users.id, id)).returning();
      return row ? toUserSummary(row) : null;
    },

    async setUserAdmin(id, isAdmin) {
      const [row] = await db.update(users).set({ isAdmin }).where(eq(users.id, id)).returning();
      return row ? toUserSummary(row) : null;
    },

    async setUserPassword(id, passwordHash) {
      const rows = await db.update(users).set({ passwordHash }).where(eq(users.id, id)).returning();
      return rows.length > 0;
    },

    async countActiveAdmins() {
      const rows = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.isAdmin, true), eq(users.disabled, false)));
      return rows.length;
    },

    async listSectionTypeRows() {
      const rows = await db.select().from(sectionTypeRows);
      return rows.map<SectionTypeRow>((r) => ({
        type: r.type,
        definition: r.definition ?? null,
        deprecated: r.deprecated,
        updatedAt: r.updatedAt.toISOString(),
      }));
    },

    async upsertSectionType({ type, definition, deprecated }) {
      const [row] = await db
        .insert(sectionTypeRows)
        .values({ type, definition: definition ?? null, deprecated })
        .onConflictDoUpdate({ target: sectionTypeRows.type, set: { definition: definition ?? null, deprecated, updatedAt: new Date() } })
        .returning();
      return { type: row!.type, definition: row!.definition ?? null, deprecated: row!.deprecated, updatedAt: row!.updatedAt.toISOString() };
    },

    async setSectionTypeDeprecated(type, deprecated) {
      const [existing] = await db.select().from(sectionTypeRows).where(eq(sectionTypeRows.type, type));
      if (!existing) {
        if (!deprecated) return null;
        const [row] = await db.insert(sectionTypeRows).values({ type, definition: null, deprecated: true }).returning();
        return { type: row!.type, definition: row!.definition ?? null, deprecated: row!.deprecated, updatedAt: row!.updatedAt.toISOString() };
      }
      const [row] = await db
        .update(sectionTypeRows)
        .set({ deprecated, updatedAt: new Date() })
        .where(eq(sectionTypeRows.type, type))
        .returning();
      return { type: row!.type, definition: row!.definition ?? null, deprecated: row!.deprecated, updatedAt: row!.updatedAt.toISOString() };
    },

    async listInUseTypeKeys() {
      const rows = await db.execute<{ type: string }>(
        sql`SELECT DISTINCT s->>'type' AS type FROM proposals, jsonb_array_elements(document->'sections') AS s`,
      );
      return ((rows as unknown as { rows?: { type: string }[] }).rows ?? (rows as unknown as { type: string }[])).map((r: { type: string }) => r.type).filter(Boolean);
    },
  };
}
