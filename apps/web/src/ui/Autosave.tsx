"use client";

import { useEffect, useRef } from "react";
import { useProposalStore } from "../state/proposalStore";

/**
 * Debounced autosave (§13.8): when the document changes and the proposal is
 * already persisted, PUT it after a quiet period. Renders nothing.
 */
export function Autosave({ debounceMs = 800 }: { debounceMs?: number }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubscribe = useProposalStore.subscribe((state, prev) => {
      if (state.document === prev.document || !state.proposalId) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void useProposalStore.getState().saveNow(), debounceMs);
    });
    return () => {
      if (timer.current) clearTimeout(timer.current);
      unsubscribe();
    };
  }, [debounceMs]);

  return null;
}
