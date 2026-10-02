import type { Moment } from "moment";
import type { TFile } from "obsidian";

import {
  getConfiguredNoteForDate,
  parseConfiguredNoteDate,
} from "./notePaths";
import {
  formatWeeklyNoteDate,
  getWeeklyNoteDateUID,
  resolveWeeklyNoteSettings,
  resolveWeeklyMomentLocale,
  type WeeklyNoteSettingsInput,
  withWeeklyMomentLocale,
} from "./weeklyNoteSettings";

export type {
  ResolvedWeeklyNoteSettings,
  WeeklyNoteSettingsInput,
} from "./weeklyNoteSettings";

export interface WeeklyNotesIndex {
  filesByPath: Record<string, TFile>;
  filesByDate: Record<string, TFile[]>;
}

/** Parse weekly paths with the same quoted-format fallback as daily notes. */
export function getDateFromWeeklyNoteFile(
  file: TFile,
  settings?: WeeklyNoteSettingsInput
): Moment | null {
  return parseConfiguredNoteDate(
    file,
    resolveWeeklyNoteSettings(settings),
    resolveWeeklyMomentLocale(settings) || undefined
  );
}

export function getAllWeeklyNotesIndex(
  settings?: WeeklyNoteSettingsInput
): WeeklyNotesIndex {
  const index: WeeklyNotesIndex = {
    filesByPath: {},
    filesByDate: {},
  };
  const weeklyNoteSettings = resolveWeeklyNoteSettings(settings);
  const locale = resolveWeeklyMomentLocale(settings) || undefined;

  window.app.vault.getMarkdownFiles().forEach((file) => {
    index.filesByPath[file.path] = file;
    const date = parseConfiguredNoteDate(file, weeklyNoteSettings, locale);
    if (!date) {
      return;
    }

    const id = getWeeklyNoteDateUID(date, settings);
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
  index: WeeklyNotesIndex | null,
  settings?: WeeklyNoteSettingsInput
): TFile | null {
  if (!index) {
    return null;
  }

  const weeklyNoteSettings = resolveWeeklyNoteSettings(settings);
  const localizedDate = withWeeklyMomentLocale(date, settings);
  const canonical = getConfiguredNoteForDate(
    // The caller may supply a start-of-week date calculated for an embedded
    // calendar's locale/week-start. Do not reapply Moment's global locale
    // here; the UID fallback below remains for legacy callers.
    localizedDate,
    weeklyNoteSettings,
    index.filesByPath,
    (formattedDate, format) =>
      formatWeeklyNoteDate(formattedDate, format, settings)
  );
  return canonical || index.filesByDate[getWeeklyNoteDateUID(localizedDate, settings)]?.[0] || null;
}
