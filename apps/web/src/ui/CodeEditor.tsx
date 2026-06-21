"use client";

import dynamic from "next/dynamic";
import type { BeforeMount } from "@monaco-editor/react";
import { themeSchema } from "@proposal/shared";
import { ThemeCodeEditor, type EditorLike, type EditorLikeProps } from "./ThemeCodeEditor";

// Monaco touches browser globals, so it must not render on the server (§ Next
// App Router). Workers load from the default CDN loader.
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <div style={{ padding: 8, opacity: 0.6 }}>Loading editor…</div>,
});

// Feed Monaco the theme JSON Schema for inline validation + autocomplete.
const configureJsonSchema: BeforeMount = (monaco) => {
  monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
    validate: true,
    enableSchemaRequest: false,
    schemas: [
      {
        uri: "https://proposal.studio/schemas/theme.json",
        fileMatch: ["*"],
        schema: themeSchema as object,
      },
    ],
  });
};

const ConfiguredEditor: EditorLike = ({ defaultValue, value, language, onChange }: EditorLikeProps) => (
  <MonacoEditor
    height="100%"
    defaultLanguage={language ?? "json"}
    beforeMount={configureJsonSchema}
    options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false }}
    {...(defaultValue !== undefined ? { defaultValue } : {})}
    {...(value !== undefined ? { value } : {})}
    {...(onChange ? { onChange } : {})}
  />
);

/** The Monaco-backed live theme/JSON editor (§8). */
export function CodeEditor() {
  return <ThemeCodeEditor EditorComponent={ConfiguredEditor} />;
}
