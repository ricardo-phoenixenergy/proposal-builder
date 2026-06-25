"use client";

import type { SectionLayout } from "@proposal/shared";
import { TemplateLayoutEditor } from "./layout/TemplateLayoutEditor";

export function LayoutEditor({
  type,
  pageFormat,
  initial,
  mode,
  onDone,
  onCancel,
}: {
  type: string;
  pageFormat: string;
  initial?: SectionLayout;
  mode: "create" | "edit";
  onDone: () => void | Promise<void>;
  onCancel: () => void;
}) {
  return (
    <TemplateLayoutEditor
      type={type}
      pageFormat={pageFormat}
      {...(initial !== undefined ? { initial } : {})}
      mode={mode}
      onDone={onDone}
      onCancel={onCancel}
    />
  );
}
