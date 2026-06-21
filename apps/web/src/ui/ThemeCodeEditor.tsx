"use client";

import { useRef, useState, type ComponentType } from "react";
import type { ValidationError } from "@proposal/shared";
import { useProposalStore } from "../state/proposalStore";
import { applyThemeJson } from "../editor/applyThemeJson";

export interface EditorLikeProps {
  defaultValue?: string;
  value?: string;
  language?: string;
  onChange?: (value: string | undefined) => void;
}
export type EditorLike = ComponentType<EditorLikeProps>;

/**
 * The live-edit pipeline (§8) decoupled from Monaco: it takes any editor-like
 * component, debounces input, runs applyThemeJson, and on success swaps the new
 * theme into the store. Invalid input surfaces errors and leaves the last good
 * theme on screen — a broken keystroke never breaks the preview.
 *
 * EditorComponent is injected so the pipeline is testable without Monaco (which
 * can't run in jsdom). The real Monaco wrapper lives in CodeEditor.tsx.
 */
export function ThemeCodeEditor({
  EditorComponent,
  debounceMs = 300,
}: {
  EditorComponent: EditorLike;
  debounceMs?: number;
}) {
  const theme = useProposalStore((s) => s.theme);
  const setTheme = useProposalStore((s) => s.setTheme);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const initialText = useRef(JSON.stringify(theme, null, 2)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = (value: string | undefined) => {
    if (timer.current) clearTimeout(timer.current);
    const text = value ?? "";
    timer.current = setTimeout(() => {
      const result = applyThemeJson(text);
      if (result.ok) {
        setErrors([]);
        setTheme(result.theme);
      } else {
        setErrors(result.errors);
      }
    }, debounceMs);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%" }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <EditorComponent defaultValue={initialText} language="json" onChange={handleChange} />
      </div>
      {errors.length > 0 ? (
        <ul data-testid="theme-errors" className="errors">
          {errors.map((e, i) => (
            <li key={i}>
              {e.path ? <code>{e.path}</code> : null} {e.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
