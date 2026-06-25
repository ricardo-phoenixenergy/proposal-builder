import { boolean, index, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { ProposalDocument, Template, ThemeTokens } from "@proposal/shared";

/** Tenancy (Theme 1). A workspace owns proposals/folders/themes; users join via
 *  workspace_members. Personal workspaces are 1:1 with a user (id = `ws_<userId>`). */
export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: text("workspace_id").notNull(),
    userId: text("user_id").notNull(),
    role: text("role").notNull().default("editor"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    index("workspace_members_user_id_idx").on(t.userId),
  ],
);

/** §12 data model. Content/structure/presentation kept intact as JSONB. */
export const folders = pgTable(
  "folders",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    workspaceId: text("workspace_id"), // Theme 1: nullable until the 1b cutover
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("folders_owner_id_idx").on(t.ownerId)],
);

export const proposals = pgTable(
  "proposals",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    workspaceId: text("workspace_id"), // Theme 1: nullable until the 1b cutover
    folderId: text("folder_id"),
    document: jsonb("document").$type<ProposalDocument>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // Soft-delete (4a): null = live; a timestamp = in the trash, recoverable.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("proposals_folder_id_idx").on(t.folderId),
    // Partial index for the hot path: the active (non-trashed) list per owner.
    index("proposals_owner_active_idx")
      .on(t.ownerId)
      .where(sql`${t.deletedAt} is null`),
  ],
);

export const proposalVersions = pgTable(
  "proposal_versions",
  {
    id: text("id").primaryKey(),
    proposalId: text("proposal_id").notNull(),
    document: jsonb("document").$type<ProposalDocument>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("proposal_versions_proposal_id_idx").on(t.proposalId)],
);

export const themes = pgTable(
  "themes",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    workspaceId: text("workspace_id"), // Theme 1: nullable until the 1b cutover
    tokens: jsonb("tokens").$type<ThemeTokens>().notNull(),
  },
  (t) => [index("themes_owner_id_idx").on(t.ownerId)],
);

export const templates = pgTable("templates", {
  id: text("id").primaryKey(),
  template: jsonb("template").$type<Template>(), // nullable: null = built-in deprecation overlay
  deprecated: boolean("deprecated").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Auth accounts (§13.10). Admin-created; email is unique and stored lowercased. */
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  isAdmin: boolean("is_admin").notNull().default(false),
  disabled: boolean("disabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Authored section types (§11 Builder). definition null = built-in deprecation overlay. */
export const sectionTypeRows = pgTable("section_types", {
  type: text("type").primaryKey(),
  definition: jsonb("definition").$type<import("@proposal/shared").SectionTypeSchema>(),
  deprecated: boolean("deprecated").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Authored section layouts (§D). Global (Builder-managed). Identity is the
 *  composite (type, variant, pageFormat), carried as the `id` PK so upserts are
 *  deterministic. The full SectionLayout lives in `layout`; type/variant/page_format
 *  are denormalised for querying. No deprecated flag — layouts are edited/deleted
 *  freely (a deleted layout just falls back to the code/generic renderer). */
export const sectionLayoutRows = pgTable("section_layouts", {
  id: text("id").primaryKey(), // `${type}:${variant}:${pageFormat}`
  type: text("type").notNull(),
  variant: text("variant").notNull(),
  pageFormat: text("page_format").notNull(),
  name: text("name").notNull(),
  layout: jsonb("layout").$type<import("@proposal/shared").SectionLayout>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** App-wide key/value settings (§10). Currently holds the admin-set AI model under "ai_model". */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
