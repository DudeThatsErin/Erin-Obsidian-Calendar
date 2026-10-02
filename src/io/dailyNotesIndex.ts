import type { Moment } from "moment";
import { normalizePath } from "obsidian";
import type { TFile } from "obsidian";
import {
  DEFAULT_DAILY_NOTE_FORMAT,
  getDailyNoteSettings,
  getDateUID,
} from "obsidian-daily-notes-interface";

export interface DailyNoteEntry {
  date: Moment;
  file: TFile;
}

export function getDateFromDailyNoteFile(file: TFile): Moment | null {
  const settings = getDailyNoteSettings() || {};
  const folder = settings.folder || "";
  const format = settings.format || DEFAULT_DAILY_NOTE_FORMAT;
  const normalizedFolder = normalizePath(folder)
    .replace(/^\/+|\/+$/g, "")
    .replace(/^\.$/, "");
  const prefix = normalizedFolder ? `${normalizedFolder}/` : "";

  if (prefix && !file.path.startsWith(prefix)) return null;

  const relativePath = file.path.slice(prefix.length).replace(/\.md$/i, "");
  const date = window.moment(relativePath, format, true);

  return date.isValid() ? date : null;
}

export function getAllDailyNotesByPath(): Record<string, TFile> {
  const notes: Record<string, TFile> = {};
  window.app.vault.getMarkdownFiles().forEach((file) => {
    const date = getDateFromDailyNoteFile(file);
    if (date) notes[getDateUID(date, "day")] = file;
  });
  return notes;
}

export function getDailyNoteEntries(
  notes: Record<string, TFile>
): DailyNoteEntry[] {
  return Object.values(notes)
    .map((file) => {
      const date = getDateFromDailyNoteFile(file);
      return date ? { date, file } : null;
    })
    .filter((entry): entry is DailyNoteEntry => entry !== null)
    .sort((left, right) => left.date.valueOf() - right.date.valueOf());
}

export function getAdjacentDailyNote(
  date: Moment,
  notes: Record<string, TFile>,
  direction: "previous" | "next"
): DailyNoteEntry | null {
  const entries = getDailyNoteEntries(notes);

  if (direction === "previous") {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      if (entries[index].date.isBefore(date, "day")) {
        return entries[index];
      }
    }
    return null;
  }

  return entries.find((entry) => entry.date.isAfter(date, "day")) || null;
}
