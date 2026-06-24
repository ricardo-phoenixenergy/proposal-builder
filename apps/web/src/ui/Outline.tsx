import { useEffect, useRef, useState } from "react";
import {
  getSectionType,
  isStructureLocked,
  listSectionTypes,
  openTemplate,
} from "@proposal/shared";
import { resolveSection } from "../registry/componentRegistry";
import { useProposalStore } from "../state/proposalStore";
import { ConfirmDialog } from "./ConfirmDialog";

/**
 * Left pane: the section list with per-section status. On unlocked (Free Editor)
 * templates it also offers positional insert (a select at each gap) and per-row
 * delete (with confirm). Outline order = render order; reorder is out of scope.
 */
export function Outline() {
  const sections = useProposalStore((s) => s.document.sections);
  const selectedId = useProposalStore((s) => s.selectedId);
  const selectSection = useProposalStore((s) => s.selectSection);
  const templateId = useProposalStore((s) => s.document.templateId);
  const templates = useProposalStore((s) => s.templates);
  const locked = isStructureLocked(templates.find((t) => t.id === templateId) ?? openTemplate);
  const insertSection = useProposalStore((s) => s.insertSection);
  const removeSection = useProposalStore((s) => s.removeSection);
  const moveSection = useProposalStore((s) => s.moveSection);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);

  // Focus the active outline-item whenever selectedId changes (roving focus).
  useEffect(() => {
    if (!navRef.current) return;
    const active = navRef.current.querySelector<HTMLElement>(".outline-item[aria-pressed='true']");
    active?.focus();
  }, [selectedId]);

  const types = listSectionTypes();

  const InsertControl = ({ index }: { index: number }) =>
    !locked ? (
      <select
        className="outline__insert"
        aria-label={`Insert section at ${index}`}
        value=""
        onChange={(e) => {
          if (e.target.value) insertSection(e.target.value, index);
        }}
      >
        <option value="">+ Insert…</option>
        {types.map((t) => (
          <option key={t.type} value={t.type}>
            {t.label}
          </option>
        ))}
      </select>
    ) : null;

  function handleKeyDown(e: React.KeyboardEvent<HTMLElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const t = e.target as HTMLElement;
    if (t.tagName === "SELECT" || t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
    e.preventDefault();
    const cur = sections.findIndex((s) => s.id === selectedId);
    let next: number;
    if (e.key === "ArrowDown") {
      next = cur < 0 ? 0 : Math.min(cur + 1, sections.length - 1);
    } else {
      next = cur < 0 ? sections.length - 1 : Math.max(cur - 1, 0);
    }
    const target = sections[next];
    if (target) selectSection(target.id);
  }

  return (
    <nav ref={navRef} aria-label="Outline" className="pane pane--rail" onKeyDown={handleKeyDown}>
      <div className="pane__heading">
        Outline
        {locked ? (
          <span className="tag tag--unstyled" style={{ marginLeft: 6 }}>
            locked
          </span>
        ) : null}
      </div>
      <div className="outline">
        <InsertControl index={0} />
        {sections.map((section, i) => {
          const { unstyled, variant } = resolveSection(section);
          const label = getSectionType(section.type)?.label ?? section.type;
          return (
            <div className="outline-row" key={section.id}>
              <button
                type="button"
                className="outline-item"
                aria-pressed={section.id === selectedId}
                tabIndex={section.id === selectedId ? 0 : -1}
                onClick={() => selectSection(section.id)}
              >
                <span className="outline-item__title">{label}</span>
                <span className="outline-item__type">{section.type}</span>
                <span className="outline-item__tags">
                  {variant ? (
                    <span className="tag" data-tag="variant">
                      {variant}
                    </span>
                  ) : null}
                  {unstyled ? (
                    <span className="tag tag--unstyled" data-tag="unstyled">
                      unstyled
                    </span>
                  ) : null}
                </span>
              </button>
              {!locked ? (
                <>
                  <button
                    type="button"
                    className="outline-item__move"
                    aria-label="Move section up"
                    title="Move up"
                    disabled={i === 0}
                    onClick={() => moveSection(section.id, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="outline-item__move"
                    aria-label="Move section down"
                    title="Move down"
                    disabled={i === sections.length - 1}
                    onClick={() => moveSection(section.id, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="outline-item__delete"
                    aria-label="Delete section"
                    title="Delete section"
                    onClick={() => setPendingDelete(section.id)}
                  >
                    ✕
                  </button>
                </>
              ) : null}
              <InsertControl index={i + 1} />
            </div>
          );
        })}
      </div>
      {pendingDelete ? (
        <ConfirmDialog
          title="Delete section"
          message="Delete this section? This cannot be undone."
          confirmLabel="Delete"
          onConfirm={() => removeSection(pendingDelete)}
          onClose={() => setPendingDelete(null)}
        />
      ) : null}
    </nav>
  );
}
