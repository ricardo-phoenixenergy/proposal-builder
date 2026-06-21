"use client";

import { useState } from "react";
import type { SectionTypeSchema, Template } from "@proposal/shared";
import { SectionTypeList } from "./SectionTypeList";
import { UsersView } from "./UsersView";
import { TemplateList } from "./TemplateList";

type Panel = "section-types" | "users" | "templates";

/** Back-of-house dashboard shell (§11). Section types + Users + Templates. */
export function AdminDashboard({
  sectionTypes,
  inUse,
  currentUserId,
  templates,
  inUseTemplates,
}: {
  sectionTypes: SectionTypeSchema[];
  inUse: string[];
  currentUserId: string;
  templates: Template[];
  inUseTemplates: string[];
}) {
  const [types, setTypes] = useState(sectionTypes);
  const [tmpls, setTmpls] = useState(templates);
  const [panel, setPanel] = useState<Panel>("section-types");

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
        </nav>
        <main className="admin__main">
          {panel === "section-types" ? (
            <SectionTypeList types={types} inUse={inUse} onChange={setTypes} />
          ) : panel === "users" ? (
            <UsersView currentUserId={currentUserId} />
          ) : (
            <TemplateList templates={tmpls} inUse={inUseTemplates} onChange={setTmpls} />
          )}
        </main>
      </div>
    </div>
  );
}
