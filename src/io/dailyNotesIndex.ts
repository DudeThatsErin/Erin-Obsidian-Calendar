import type { Moment } from "moment";
import type { TFile } from "obsidian";
import {
  DEFAULT_DAILY_NOTE_FORMAT,
  getDailyNoteSettings,
  getDateUID,
} from "obsidian-daily-notes-interface";

import {
  getConfiguredNoteForDate,
  parseConfiguredNoteDate,
} from "./notePaths";

export interface DailyNoteEntry {
  date: Moment;
  file: TFile;
}

export interface DailyNoteIndexOptions {
  metadataDateFormat?: string;
  metadataDateProperty?: string;
  useMetadataDates?: boolean;
  /** Moment locale used by this calendar when parsing textual date values. */
  locale?: string;
}

export interface DailyNotesIndex {
  /** Every markdown file by exact, normalized vault path. */
  filesByPath: Record<string, TFile>;
  /** All files associated with a calendar day, including metadata matches. */
  filesByDate: Record<string, TFile[]>;
  /** Sorted entries used for previous/next existing-note navigation. */
  entries: DailyNoteEntry[];
}

function dailyNoteSettings() {
  const settings = getDailyNoteSettings() || {};
  return {
    ...settings,
    format: settings.format || DEFAULT_DAILY_NOTE_FORMAT,
  };
}

function uniqueFiles(files: TFile[]): TFile[] {
  const seen = new Set<string>();
  return files.filter((file) => {
    if (seen.has(file.path)) {
      return false;
    }
    seen.add(file.path);
    return true;
  });
}

function addDateEntry(
  index: DailyNotesIndex,
  date: Moment,
  file: TFile
): void {
  const id = getDateUID(date, "day");
  const dateFiles = index.filesByDate[id] || [];
  if (!dateFiles.some((existing) => existing.path === file.path)) {
    dateFiles.push(file);
    index.filesByDate[id] = dateFiles;
    index.entries.push({ date: date.clone().startOf("day"), file });
  }
}

/** Parse a daily note path using the exact Daily Notes folder and format. */
export function getDateFromDailyNoteFile(
  file: TFile,
  options: DailyNoteIndexOptions = {}
): Moment | null {
  return parseConfiguredNoteDate(file, dailyNoteSettings(), options.locale);
}

function parseMetadataDateValue(
  value: unknown,
  format: string,
  locale?: string
): Moment | null {
  if (value instanceof Date || typeof value === "number") {
    const date = window.moment(value);
    return date.isValid() ? date : null;
  }
  if (typeof value !== "string") {
    return null;
  }

  const configured = locale
    ? window.moment(value, format, locale, true)
    : window.moment(value, format, true);
  if (configured.isValid()) {
    return configured;
  }

  const iso = window.moment(value, window.moment.ISO_8601, true);
  return iso.isValid() ? iso : null;
}

/**
 * Read the configured frontmatter property as a calendar date. A strict custom
 * format is preferred, with ISO dates/timestamps accepted for imported notes.
 */
export function getDateFromDailyNoteMetadata(
  file: TFile,
  options: DailyNoteIndexOptions = {}
): Moment | null {
  if (!options.useMetadataDates) {
    return null;
  }

  const property = options.metadataDateProperty?.trim() || "date";
  const format = options.metadataDateFormat?.trim() || "YYYY-MM-DD";
  const frontmatter = window.app.metadataCache?.getFileCache(file)?.frontmatter;
  const rawValue = frontmatter?.[property];
  const values = Array.isArray(rawValue) ? rawValue : [rawValue];

  for (const value of values) {
    const date = parseMetadataDateValue(value, format, options.locale);
    if (date) {
      return date;
    }
  }
  return null;
}

/** Prefer a configured metadata date when that optional integration is on. */
export function getDateFromCalendarDailyNote(
  file: TFile,
  options: DailyNoteIndexOptions = {}
): Moment | null {
  return (
    getDateFromDailyNoteMetadata(file, options) ||
    getDateFromDailyNoteFile(file, options)
  );
}

/**
 * Build a full daily-note index. Unlike the interface package's UID-only map,
 * this retains all files for a date and an exact path lookup for month/year
 * formats whose one note represents more than one calendar day.
 */
export function getAllDailyNotesIndex(
  options: DailyNoteIndexOptions = {}
): DailyNotesIndex {
  const index: DailyNotesIndex = {
    filesByPath: {},
    filesByDate: {},
    entries: [],
  };

  window.app.vault.getMarkdownFiles().forEach((file) => {
    index.filesByPath[file.path] = file;

    const filenameDate = getDateFromDailyNoteFile(file, options);
    if (filenameDate) {
      addDateEntry(index, filenameDate, file);
    }

    const metadataDate = getDateFromDailyNoteMetadata(file, options);
    if (metadataDate) {
      addDateEntry(index, metadataDate, file);
    }
  });

  index.entries.sort((left, right) => {
    const dateDifference = left.date.valueOf() - right.date.valueOf();
    return dateDifference || left.file.path.localeCompare(right.file.path);
  });
  return index;
}

/**
 * Compatibility helper for callers that only need one path-parsed note per
 * day. Internal calendar code should use the richer index above.
 */
export function getAllDailyNotesByPath(): Record<string, TFile> {
  const notes: Record<string, TFile> = {};
  getAllDailyNotesIndex().entries.forEach(({ date, file }) => {
    notes[getDateUID(date, "day")] = file;
  });
  return notes;
}

/**
 * Resolve all notes for a clicked calendar date. The canonical path lookup is
 * deliberately first, so `YYYYMM` and quoted formats find their existing
 * shared note before a new note can be created.
 */
export function getDailyNotesForDate(
  date: Moment,
  index: DailyNotesIndex | null,
  options: DailyNoteIndexOptions = {}
): TFile[] {
  if (!index) {
    return [];
  }

  const configuredDate = options.locale ? date.clone().locale(options.locale) : date;
  const canonical = getConfiguredNoteForDate(
    configuredDate,
    dailyNoteSettings(),
    index.filesByPath
  );
  const indexed = index.filesByDate[getDateUID(date, "day")] || [];
  return uniqueFiles(canonical ? [canonical, ...indexed] : indexed);
}

export function getDailyNoteForDate(
  date: Moment,
  index: DailyNotesIndex | null,
  options: DailyNoteIndexOptions = {}
): TFile | null {
  return getDailyNotesForDate(date, index, options)[0] || null;
}

export function getDailyNoteEntries(
  notes: DailyNotesIndex | Record<string, TFile> | null | undefined
): DailyNoteEntry[] {
  if (!notes) {
    return [];
  }
  const index = notes as DailyNotesIndex;
  if (Array.isArray(index.entries)) {
    return index.entries;
  }

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
  notes: DailyNotesIndex | Record<string, TFile> | null | undefined,
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
