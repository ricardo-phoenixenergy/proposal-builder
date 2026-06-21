import { getSectionType, isStructureLocked, listSectionTypes, openTemplate } from "@proposal/shared";
import { resolveSection } from "../registry/componentRegistry";
import { useProposalStore } from "../state/proposalStore";

/**
 * Left pane: the section list with per-section status — chosen variant as a tag
 * and an "unstyled" flag for fallback-rendered sections (§11, §5.4). Clicking a
 * section selects it for the inspector.
 */
export function Outline() {
  const sections = useProposalStore((s) => s.document.sections);
  const selectedId = useProposalStore((s) => s.selectedId);
  const selectSection = useProposalStore((s) => s.selectSection);
  const templateId = useProposalStore((s) => s.document.templateId);
  const templates = useProposalStore((s) => s.templates);
  const locked = isStructureLocked(templates.find((t) => t.id === templateId) ?? openTemplate);
  const addSection = useProposalStore((s) => s.addSection);

  return (
    <nav aria-label="Outline" className="pane pane--rail">
      <div className="pane__heading">
        Outline{locked ? <span className="tag tag--unstyled" style={{ marginLeft: 6 }}>locked</span> : null}
      </div>
      <div className="outline">
        {sections.map((section) => {
          const { unstyled, variant } = resolveSection(section);
          const label = getSectionType(section.type)?.label ?? section.type;
          return (
            <button
              key={section.id}
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
          );
        })}
      </div>
      {!locked ? (
        <div className="outline__add">
          <label className="field__label" htmlFor="add-section">
            Add section
          </label>
          <select
            id="add-section"
            aria-label="Add section"
            value=""
            onChange={(e) => {
              if (e.target.value) addSection(e.target.value);
            }}
          >
            <option value="">+ Add section…</option>
            {listSectionTypes().map((t) => (
              <option key={t.type} value={t.type}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </nav>
  );
}
