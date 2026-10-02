import type { WorkspaceLeaf } from "obsidian";

/**
 * A modifier-click represents a new tab, not a split beside the active pane.
 * Plain clicks retain Obsidian's normal reusable-leaf behavior.
 */
export function getNoteLeaf(inNewTab: boolean): WorkspaceLeaf {
  const { workspace } = window.app;
  return inNewTab ? workspace.getLeaf("tab") : workspace.getUnpinnedLeaf();
}
