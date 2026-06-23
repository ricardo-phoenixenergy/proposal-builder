import { boolean, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { ProposalDocument, Template, ThemeTokens } from "@proposal/shared";

/** §12 data model. Content/structure/presentation kept intact as JSONB. */
export const folders = pgTable("folders", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const proposals = pgTable("proposals", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  folderId: text("folder_id"),
  document: jsonb("document").$type<ProposalDocument>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const proposalVersions = pgTable("proposal_versions", {
  id: text("id").primaryKey(),
  proposalId: text("proposal_id").notNull(),
  document: jsonb("document").$type<ProposalDocument>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const themes = pgTable("themes", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  tokens: jsonb("tokens").$type<ThemeTokens>().notNull(),
});

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
