"use client";
import { useStore } from "zustand";
import { useProposalStore } from "./proposalStore";

/** React access to the zundo temporal store (undo/redo + availability flags). */
export function useTemporal(): {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
} {
  const canUndo = useStore(useProposalStore.temporal, (s) => s.pastStates.length > 0);
  const canRedo = useStore(useProposalStore.temporal, (s) => s.futureStates.length > 0);
  const undo = useProposalStore.temporal.getState().undo;
  const redo = useProposalStore.temporal.getState().redo;
  return { undo: () => undo(), redo: () => redo(), canUndo, canRedo };
}
