import { getSectionType, isStructureLocked, listSectionTypes, openTemplate } from "@proposal/shared";
import { resolveSection } from "../registry/componentRegistry";
import { useProposalStore } from "../state/proposalStore";

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

  return (
    <nav aria-label="Outline" className="pane pane--rail">
      <div className="pane__heading">
        Outline{locked ? <span className="tag tag--unstyled" style={{ marginLeft: 6 }}>locked</span> : null}
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
                <button
                  type="button"
                  className="outline-item__delete"
                  aria-label="Delete section"
                  title="Delete section"
                  onClick={() => {
                    if (window.confirm("Delete this section? This cannot be undone.")) removeSection(section.id);
                  }}
                >
                  ✕
                </button>
              ) : null}
              <InsertControl index={i + 1} />
            </div>
          );
        })}
      </div>
    </nav>
  );
}
