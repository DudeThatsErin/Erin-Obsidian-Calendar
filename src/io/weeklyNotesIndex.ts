import type { Moment } from "moment";
import type { TFile } from "obsidian";
import { getDateUID, getWeeklyNoteSettings } from "obsidian-daily-notes-interface";

import {
  getConfiguredNoteForDate,
  parseConfiguredNoteDate,
} from "./notePaths";

export interface WeeklyNotesIndex {
  filesByPath: Record<string, TFile>;
  filesByDate: Record<string, TFile[]>;
}

/** Parse weekly paths with the same quoted-format fallback as daily notes. */
export function getDateFromWeeklyNoteFile(file: TFile): Moment | null {
  return parseConfiguredNoteDate(file, getWeeklyNoteSettings());
}

export function getAllWeeklyNotesIndex(): WeeklyNotesIndex {
  const index: WeeklyNotesIndex = {
    filesByPath: {},
    filesByDate: {},
  };

  window.app.vault.getMarkdownFiles().forEach((file) => {
    index.filesByPath[file.path] = file;
    const date = getDateFromWeeklyNoteFile(file);
    if (!date) {
      return;
    }

    const id = getDateUID(date, "week");
    const dateFiles = index.filesByDate[id] || [];
    if (!dateFiles.some((existing) => existing.path === file.path)) {
      dateFiles.push(file);
      index.filesByDate[id] = dateFiles;
    }
  });
  return index;
}

/**
 * Resolve by the exact configured path first, which covers formats containing
 * literal apostrophes and week/month/day combinations Moment cannot strictly
 * parse back from a filename.
 */
export function getWeeklyNoteForDate(
  date: Moment,
  index: WeeklyNotesIndex | null
): TFile | null {
  if (!index) {
    return null;
  }

  const canonical = getConfiguredNoteForDate(
    date.clone().startOf("week"),
    getWeeklyNoteSettings(),
    index.filesByPath
  );
  return canonical || index.filesByDate[getDateUID(date, "week")]?.[0] || null;
}
