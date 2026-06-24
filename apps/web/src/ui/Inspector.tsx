"use client";

import { useProposalStore } from "../state/proposalStore";
import { BriefPane } from "./inspector/BriefPane";
import { DocumentPane } from "./inspector/DocumentPane";
import { SectionPane } from "./inspector/SectionPane";

/**
 * Right pane: a collapsible Document disclosure (template + theme) atop an AI
 * workspace — the proposal brief, a section-rewrite instruction, and a
 * schema-driven field area (text fields AI-composable, data fields manual).
 */
export function Inspector() {
  const selectedId = useProposalStore((s) => s.selectedId);

  return (
    <aside aria-label="Inspector" className="pane inspector">
      <DocumentPane />

      <BriefPane />

      {selectedId ? (
        <SectionPane />
      ) : (
        <div className="group">
          <small className="meter">Select a section to edit it.</small>
        </div>
      )}
    </aside>
  );
}
