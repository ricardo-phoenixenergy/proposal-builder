"use client";

import type { ThemeTokens } from "@proposal/shared";
import { useProposalStore } from "../state/proposalStore";

/**
 * Structured token controls — the no-typing path to editing the theme. Every
 * change writes the whole theme back to the store, so the preview re-skins live
 * via CSS variables (§4.3).
 */
export function ThemeForm() {
  const theme = useProposalStore((s) => s.theme);
  const setTheme = useProposalStore((s) => s.setTheme);

  const patch = (next: Partial<ThemeTokens>) => setTheme({ ...theme, ...next });
  const setColor = (key: keyof ThemeTokens["colors"], value: string) =>
    patch({ colors: { ...theme.colors, [key]: value } });
  const setFont = (key: keyof ThemeTokens["fonts"], value: string) =>
    patch({ fonts: { ...theme.fonts, [key]: value } });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {(Object.keys(theme.colors) as (keyof ThemeTokens["colors"])[]).map((key) => (
        <div className="field field--row" key={key}>
          <span className="field__label">{key}</span>
          <input
            type="color"
            aria-label={`color-${key}`}
            value={theme.colors[key]}
            onChange={(e) => setColor(key, e.target.value)}
          />
        </div>
      ))}

      <div className="field">
        <span className="field__label">heading font</span>
        <input aria-label="font-heading" value={theme.fonts.heading} onChange={(e) => setFont("heading", e.target.value)} />
      </div>
      <div className="field">
        <span className="field__label">body font</span>
        <input aria-label="font-body" value={theme.fonts.body} onChange={(e) => setFont("body", e.target.value)} />
      </div>

      <div className="field field--row">
        <span className="field__label">radius</span>
        <input
          type="number"
          aria-label="radius"
          value={theme.radius}
          onChange={(e) => patch({ radius: Number(e.target.value) })}
        />
      </div>
      <div className="field field--row">
        <span className="field__label">spacing</span>
        <input
          type="number"
          step="0.1"
          aria-label="spacing"
          value={theme.spacing}
          onChange={(e) => patch({ spacing: Number(e.target.value) })}
        />
      </div>
    </div>
  );
}
