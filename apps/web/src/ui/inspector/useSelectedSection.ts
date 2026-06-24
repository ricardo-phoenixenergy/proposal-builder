"use client";

import { useShallow } from "zustand/react/shallow";
import { useProposalStore } from "../../state/proposalStore";

export function useSelectedSection() {
  return useProposalStore(
    useShallow((s) => {
      const index = s.document.sections.findIndex((x) => x.id === s.selectedId);
      return { section: index >= 0 ? s.document.sections[index]! : null, index };
    }),
  );
}
