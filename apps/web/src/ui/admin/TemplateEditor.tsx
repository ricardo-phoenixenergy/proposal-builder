"use client";

import { useMemo, useState } from "react";
import { validateTemplateDefinition, type SlotLock, type Template } from "@proposal/shared";
import { createTemplate, updateTemplate } from "../../client/templates";
import { useProposalStore } from "../../state/proposalStore";
import { themes } from "../../theme/themes";

const LOCKS: SlotLock[] = ["open", "editable-copy", "editable-data", "fixed"];

type DraftSlot = { id: string; type: string; lock: SlotLock; data: Record<string, string> };

function toDef(id: string, name: string, themeId: string, locked: boolean, slots: DraftSlot[]): Template {
  return {
    id: id.trim(),
    name: name.trim(),
    themeId,
    locked,
    slots: slots.map(({ type, lock, data }) => {
      const hasData = lock === "fixed" && Object.keys(data).some((k) => data[k]?.trim() !== "");
      return {
        kind: "fixed" as const,
        type,
        lock,
        ...(hasData ? { data: Object.fromEntries(Object.entries(data).filter(([, v]) => v.trim() !== "")) } : {}),
      };
    }),
  };
}

export function TemplateEditor({
  initial,
  mode = "create",
  onDone,
  onCancel,
}: {
  initial?: Template;
  mode?: "create" | "edit";
  onDone: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const notify = useProposalStore((s) => s.notify);
  const sectionTypes = useProposalStore((s) => s.sectionTypes);
  const editing = mode === "edit";
  const pickableTypes = sectionTypes.filter((t) => !t.deprecated);

  const [id, setId] = useState(initial?.id ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [themeId, setThemeId] = useState(initial?.themeId ?? themes[0]?.id ?? "");
  const [locked, setLocked] = useState(initial?.locked ?? false);
  const [slots, setSlots] = useState<DraftSlot[]>(
    (initial?.slots ?? []).flatMap((s) =>
      s.kind === "fixed"
        ? [{ id: crypto.randomUUID(), type: s.type, lock: s.lock, data: Object.fromEntries(Object.entries(s.data ?? {}).map(([k, v]) => [k, String(v)])) }]
        : [], // choice slots aren't editable in v1; drop them from the draft
    ),
  );
  const [busy, setBusy] = useState(false);

  const def = useMemo(() => toDef(id, name, themeId, locked, slots), [id, name, themeId, locked, slots]);
  const result = useMemo(
    () => validateTemplateDefinition(def, { sectionTypes, themeIds: themes.map((t) => t.id) }),
    [def, sectionTypes],
  );

  const addSlot = () =>
    setSlots((s) => [...s, { id: crypto.randomUUID(), type: pickableTypes[0]?.type ?? "", lock: "open", data: {} }]);
  const patch = (i: number, p: Partial<DraftSlot>) => setSlots((s) => s.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const remove = (i: number) => setSlots((s) => s.filter((_, j) => j !== i));
  const move = (i: number, dir: -1 | 1) =>
    setSlots((s) => {
      const j = i + dir;
      if (j < 0 || j >= s.length) return s;
      const next = [...s];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  const textFieldsOf = (type: string) =>
    (sectionTypes.find((t) => t.type === type)?.fields ?? []).filter((f) => f.type === "text" || f.type === "paragraph");

  const save = async () => {
    setBusy(true);
    try {
      if (editing) await updateTemplate(def.id, def);
      else await createTemplate(def);
      notify("success", editing ? "Template updated." : "Template created.");
      await onDone();
    } catch (e) {
      notify("error", e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="steditor">
      <h2>{editing ? "Edit template" : "New template"}</h2>

      <label className="field">
        <span className="field__label">Template id</span>
        <input aria-label="Template id" value={id} disabled={editing} onChange={(e) => setId(e.target.value)} placeholder="tmpl_sales" />
      </label>
      <label className="field">
        <span className="field__label">Template name</span>
        <input aria-label="Template name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Sales proposal" />
      </label>
      <label className="field">
        <span className="field__label">Theme</span>
        <select aria-label="Theme" value={themeId} onChange={(e) => setThemeId(e.target.value)}>
          {themes.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </label>
      <label className="steditor__req">
        <input type="checkbox" checked={locked} onChange={(e) => setLocked(e.target.checked)} /> Locked (pins structure &amp; theme)
      </label>

      <div className="field">
        <span className="field__label">Slots</span>
        {slots.map((s, i) => (
          <div key={s.id} className="steditor__field" data-slot={i}>
            <select aria-label="Slot type" value={s.type} onChange={(e) => patch(i, { type: e.target.value })}>
              {pickableTypes.map((t) => (
                <option key={t.type} value={t.type}>{t.label}</option>
              ))}
            </select>
            <select aria-label="Slot lock" value={s.lock} onChange={(e) => patch(i, { lock: e.target.value as SlotLock })}>
              {LOCKS.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
            <button type="button" className="btn btn--ghost" onClick={() => move(i, -1)} aria-label="Move up">↑</button>
            <button type="button" className="btn btn--ghost" onClick={() => move(i, 1)} aria-label="Move down">↓</button>
            <button type="button" className="btn btn--ghost" onClick={() => remove(i)}>Remove</button>
            {s.lock === "fixed" ? (
              <div className="steditor__fixed">
                {textFieldsOf(s.type).map((f) => (
                  <input
                    key={f.key}
                    aria-label={`Fixed ${f.key}`}
                    value={s.data[f.key] ?? ""}
                    onChange={(e) => patch(i, { data: { ...s.data, [f.key]: e.target.value } })}
                    placeholder={f.label ?? f.key}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ))}
        <button type="button" className="btn" onClick={addSlot}>Add slot</button>
      </div>

      {!result.valid ? (
        <ul className="notice notice--warn">
          {result.errors.map((e, i) => (
            <li key={i}><code>{e.path}</code> — {e.message}</li>
          ))}
        </ul>
      ) : null}

      <div className="steditor__actions">
        <button type="button" className="btn btn--primary" disabled={!result.valid || busy} onClick={() => void save()}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
