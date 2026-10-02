import type { Moment } from "moment";
import { normalizePath } from "obsidian";
import type { TFile } from "obsidian";
import type { IPeriodicNoteSettings } from "obsidian-daily-notes-interface";

export type NoteDateFormatter = (date: Moment, format: string) => string;

const defaultDateFormatter: NoteDateFormatter = (date, format) =>
  date.format(format);

function normalizedFolder(folder = ""): string {
  return normalizePath(folder)
    .replace(/^\/+|\/+$/g, "")
    .replace(/^\.$/, "");
}

/** Build the exact vault path which a configured note would use for a date. */
export function getConfiguredNotePath(
  date: Moment,
  settings: IPeriodicNoteSettings,
  formatDate: NoteDateFormatter = defaultDateFormatter
): string | null {
  const format = settings?.format;
  if (!format) {
    return null;
  }

  const filename = `${formatDate(date, format)}.md`;
  const folder = normalizedFolder(settings.folder);
  return normalizePath(folder ? `${folder}/${filename}` : filename);
}

/**
 * Return the note path relative to its configured folder, without its markdown
 * extension. This keeps formats which include nested folders working.
 */
export function getRelativeConfiguredNotePath(
  file: TFile,
  settings: IPeriodicNoteSettings
): string | null {
  const normalizedPath = normalizePath(file.path);
  const folder = normalizedFolder(settings?.folder);
  const prefix = folder ? `${folder}/` : "";

  if (prefix && !normalizedPath.startsWith(prefix)) {
    return null;
  }
  if (!normalizedPath.toLowerCase().endsWith(".md")) {
    return null;
  }

  return normalizedPath.slice(prefix.length, -3);
}

/**
 * Moment cannot strictly parse a literal apostrophe in a format such as
 * `YYYY-MM-DD['s note]`. Fall back to its lenient parser only when formatting
 * the result reproduces the original path exactly.
 */
export function parseConfiguredNoteDate(
  file: TFile,
  settings: IPeriodicNoteSettings,
  locale?: string
): Moment | null {
  const format = settings?.format;
  const relativePath = getRelativeConfiguredNotePath(file, settings);
  if (!format || relativePath === null) {
    return null;
  }

  const strict = locale
    ? window.moment(relativePath, format, locale, true)
    : window.moment(relativePath, format, true);
  if (strict.isValid()) {
    return strict;
  }

  const lenient = locale
    ? window.moment(relativePath, format, locale, false)
    : window.moment(relativePath, format, false);
  return lenient.isValid() && lenient.format(format) === relativePath
    ? lenient
    : null;
}

/** Find a configured note from a pre-built path index without date-UID loss. */
export function getConfiguredNoteForDate(
  date: Moment,
  settings: IPeriodicNoteSettings,
  notesByPath: Record<string, TFile>,
  formatDate: NoteDateFormatter = defaultDateFormatter
): TFile | null {
  const path = getConfiguredNotePath(date, settings, formatDate);
  return path ? notesByPath[path] || null : null;
}
