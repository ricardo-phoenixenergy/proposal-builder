"use client";

import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  fieldKind,
  getSectionType,
  isStructureLocked,
  openTemplate,
  variantRangeWarnings,
} from "@proposal/shared";
import { availableVariants, resolveSection } from "../../registry/componentRegistry";
import { useProposalStore } from "../../state/proposalStore";
import { requestFieldGeneration, requestSectionGeneration } from "../../client/generate";
import { useSelectedSection } from "./useSelectedSection";
import { FieldArea } from "./FieldArea";

export function SectionPane() {
  const { section, index: selectedIndex } = useSelectedSection();

  const { templateId, pageFormat, brief } = useProposalStore(
    useShallow((s) => ({
      templateId: s.document.templateId,
      pageFormat: s.document.pageFormat,
      brief: s.document.brief ?? "",
    })),
  );

  const templates = useProposalStore((s) => s.templates);
  const setVariant = useProposalStore((s) => s.setVariant);
  const setSectionData = useProposalStore((s) => s.setSectionData);
  const setSectionType = useProposalStore((s) => s.setSectionType);
  const setPageBreakBefore = useProposalStore((s) => s.setPageBreakBefore);
  const notify = useProposalStore((s) => s.notify);

  const [busy, setBusy] = useState(false);
  const [sectionInstruction, setSectionInstruction] = useState("");
  const [fieldInstr, setFieldInstr] = useState<Record<string, string>>({});

  // Derived values — must run unconditionally (hooks rule), guard below handles null section.
  const template = templates.find((t) => t.id === templateId) ?? openTemplate;
  const structureLocked = isStructureLocked(template);
  const slot = selectedIndex >= 0 ? template.slots[selectedIndex] : undefined;
  const choiceSlot = slot?.kind === "choice" ? slot : undefined;
  const typeSchema = section ? getSectionType(section.type) : undefined;
  const variants = section ? availableVariants(section.type, pageFormat) : [];
  const rangeWarnings = section ? variantRangeWarnings(section) : [];
  const isUnstyled = section ? resolveSection(section).unstyled : false;
  const hasAiFields = (typeSchema?.fields ?? []).some((f) => fieldKind(f) === "ai");

  if (!section || !typeSchema) return null;

  const setField = (key: string, value: unknown) => {
    setSectionData(section.id, { ...section.data, [key]: value });
  };

  const rewriteSection = async () => {
    setBusy(true);
    const result = await requestSectionGeneration({
      type: section.type,
      brief,
      instruction: sectionInstruction,
      sectionId: section.id,
    });
    setBusy(false);
    if (result.ok && result.data) {
      setSectionData(section.id, { ...section.data, ...result.data }); // merge: keep data/manual fields
      notify("success", "Section rewritten.");
    } else {
      notify("error", result.error ?? "Generation failed");
    }
  };

  const rewriteField = async (key: string) => {
    setBusy(true);
    const current = typeof section.data[key] === "string" ? section.data[key] : "";
    const result = await requestFieldGeneration({
      type: section.type,
      fieldKey: key,
      brief,
      instruction: fieldInstr[key] ?? "",
      currentValue: current,
      sectionId: section.id,
    });
    setBusy(false);
    if (result.ok) {
      setField(key, result.value);
      notify("success", "Field rewritten.");
    } else {
      notify("error", result.error ?? "Generation failed");
    }
  };

  return (
    <div className="group">
      <div className="group__title">Section · {typeSchema.label}</div>

      {isUnstyled ? (
        <p className="notice notice--warn" data-flag="unstyled">
          No layout is registered for this section — it&apos;s rendering with the generic (unstyled)
          fallback.
        </p>
      ) : null}

      {rangeWarnings.length > 0 ? (
        <ul className="notice notice--warn" data-flag="range">
          {rangeWarnings.map((w) => (
            <li key={`${w.fieldKey}:${w.message}`}>{w.message}</li>
          ))}
        </ul>
      ) : null}

      {choiceSlot ? (
        <div className="field">
          <span className="field__label">Commercial model (choice slot)</span>
          <select
            aria-label="Choice type"
            value={section.type}
            onChange={(e) => setSectionType(section.id, e.target.value)}
          >
            {choiceSlot.allowed.map((t) => (
              <option key={t} value={t}>
                {getSectionType(t)?.label ?? t}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {/* Section rewrite */}
      {hasAiFields ? (
        <div className="field">
          <span className="field__label">Rewrite section (all text fields)</span>
          <textarea
            aria-label="section-instruction"
            rows={2}
            value={sectionInstruction}
            onChange={(e) => setSectionInstruction(e.target.value)}
            placeholder="Optional instruction, e.g. 'make it more concise'"
          />
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy}
            onClick={() => void rewriteSection()}
          >
            {busy ? "Working…" : "Rewrite section with AI"}
          </button>
        </div>
      ) : null}

      {/* Schema-driven field area */}
      <FieldArea
        section={section}
        selectedIndex={selectedIndex}
        typeSchema={typeSchema}
        template={template}
        busy={busy}
        fieldInstr={fieldInstr}
        setFieldInstr={setFieldInstr}
        setField={setField}
        rewriteField={(key) => void rewriteField(key)}
      />

      {!structureLocked ? (
        <label className="field field--row">
          <span className="field__label">Page break before this section</span>
          <input
            type="checkbox"
            aria-label="Page break before this section"
            checked={section.pageBreakBefore ?? false}
            onChange={(e) => setPageBreakBefore(section.id, e.target.checked)}
          />
        </label>
      ) : null}

      {!structureLocked && variants.length > 0 ? (
        <div className="field">
          <span className="field__label">Variant</span>
          <select
            aria-label="Variant"
            value={section.variant ?? typeSchema.defaultVariant ?? ""}
            onChange={(e) => setVariant(section.id, e.target.value)}
          >
            {variants.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}
