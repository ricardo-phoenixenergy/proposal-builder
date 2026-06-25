"use client";

import { useEffect, useState } from "react";
import {
  setActiveSectionTypes,
  type GenerationModelId,
  type SectionTypeSchema,
  type Template,
} from "@proposal/shared";
import { SectionTypeList } from "./SectionTypeList";
import { UsersView } from "./UsersView";
import { TemplateList } from "./TemplateList";
import { SettingsPanel } from "./SettingsPanel";

type Panel = "section-types" | "users" | "templates" | "settings";

/** Back-of-house dashboard shell (§11). Section types + Users + Templates. */
export function AdminDashboard({
  sectionTypes,
  inUse,
  currentUserId,
  templates,
  inUseTemplates,
  aiModel,
}: {
  sectionTypes: SectionTypeSchema[];
  inUse: string[];
  currentUserId: string;
  templates: Template[];
  inUseTemplates: string[];
  aiModel: GenerationModelId;
}) {
  const [types, setTypes] = useState(sectionTypes);
  const [tmpls, setTmpls] = useState(templates);
  const [panel, setPanel] = useState<Panel>("section-types");

  // Hydrate the shared section-type registry so getSectionType() resolves AUTHORED
  // types in the layout editor (BlockTree/BlockStylePanel field bindings, image
  // background binding, layout validation). The server seeds its own module instance
  // via getMergedSectionTypes; the client bundle starts with built-ins only, so
  // without this an authored type has no fields to bind and Save stays disabled.
  // Re-runs when `types` changes (e.g. after creating/editing a type).
  useEffect(() => {
    setActiveSectionTypes(types);
  }, [types]);

  return (
    <div className="admin">
      <header className="admin__bar">
        <h1 className="admin__title">Builder</h1>
        <a className="btn btn--ghost" href="/">
          ← Back to editor
        </a>
      </header>
      <div className="admin__body">
        <nav className="admin__nav" aria-label="Builder sections">
          <button
            type="button"
            className="admin__navitem"
            aria-current={panel === "section-types"}
            onClick={() => setPanel("section-types")}
          >
            Section types
          </button>
          <button
            type="button"
            className="admin__navitem"
            aria-current={panel === "users"}
            onClick={() => setPanel("users")}
          >
            Users
          </button>
          <button
            type="button"
            className="admin__navitem"
            aria-current={panel === "templates"}
            onClick={() => setPanel("templates")}
          >
            Templates
          </button>
          <button
            type="button"
            className="admin__navitem"
            aria-current={panel === "settings"}
            onClick={() => setPanel("settings")}
          >
            Settings
          </button>
        </nav>
        <main className="admin__main">
          {panel === "section-types" ? (
            <SectionTypeList types={types} inUse={inUse} onChange={setTypes} />
          ) : panel === "users" ? (
            <UsersView currentUserId={currentUserId} />
          ) : panel === "templates" ? (
            <TemplateList
              templates={tmpls}
              inUse={inUseTemplates}
              sectionTypes={types}
              onChange={setTmpls}
            />
          ) : (
            <SettingsPanel initialModel={aiModel} />
          )}
        </main>
      </div>
    </div>
  );
}
