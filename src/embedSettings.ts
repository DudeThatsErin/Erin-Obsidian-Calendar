import { parseYaml } from "obsidian";

import type { CalendarViewMode, ISettings } from "./settings";

/** A validated subset of settings supplied by one `erin-calendar` code block. */
export type EmbedSettingsOverrides = Partial<ISettings>;

/**
 * The parsed settings and any non-fatal problems found in the code block.
 *
 * Consumers should render the calendar with `overrides` and surface
 * `diagnostics` in a way that is appropriate for their view (for example,
 * `console.warn` with the source note's path).
 */
export interface EmbedSettingsParseResult {
  overrides: EmbedSettingsOverrides;
  diagnostics: string[];
}

type BooleanSettingKey =
  | "shouldConfirmBeforeCreate"
  | "showMonthlyNote"
  | "showQuarterlyNote"
  | "showYearlyNote"
  | "showWeeklyNote"
  | "showDateTags"
  | "useMetadataDates";

type StringSettingKey =
  | "weekdayLabelFormat"
  | "weeklyNoteFormat"
  | "weeklyNoteTemplate"
  | "weeklyNoteFolder"
  | "metadataDateProperty"
  | "metadataDateFormat"
  | "localeOverride";

const BOOLEAN_SETTING_KEYS: readonly BooleanSettingKey[] = [
  "shouldConfirmBeforeCreate",
  "showMonthlyNote",
  "showQuarterlyNote",
  "showYearlyNote",
  "showWeeklyNote",
  "showDateTags",
  "useMetadataDates",
];

const STRING_SETTING_KEYS: readonly StringSettingKey[] = [
  "weekdayLabelFormat",
  "weeklyNoteFormat",
  "weeklyNoteTemplate",
  "weeklyNoteFolder",
  "metadataDateProperty",
  "metadataDateFormat",
  "localeOverride",
];

const WEEK_START_OPTIONS = new Set<string>([
  "locale",
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
]);

const CALENDAR_VIEW_OPTIONS = new Set<CalendarViewMode>(["month", "year"]);

const SETTING_KEYS = new Set<keyof ISettings>([
  "calendarView",
  "wordsPerDot",
  "weekdayLabelFormat",
  "weekStart",
  "shouldConfirmBeforeCreate",
  "showMonthlyNote",
  "showQuarterlyNote",
  "showYearlyNote",
  "showWeeklyNote",
  "weeklyNoteFormat",
  "weeklyNoteTemplate",
  "weeklyNoteFolder",
  "showDateTags",
  "useMetadataDates",
  "metadataDateProperty",
  "metadataDateFormat",
  "localeOverride",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isBooleanSettingKey(key: string): key is BooleanSettingKey {
  return (BOOLEAN_SETTING_KEYS as readonly string[]).includes(key);
}

function isStringSettingKey(key: string): key is StringSettingKey {
  return (STRING_SETTING_KEYS as readonly string[]).includes(key);
}

/**
 * Parses the contents of an `erin-calendar` fenced block as YAML.
 *
 * Only known, correctly-typed settings are returned. Invalid settings never
 * prevent the calendar from rendering; they are omitted and explained in
 * `diagnostics` instead.
 */
export function parseEmbedSettings(
  source: string
): EmbedSettingsParseResult {
  if (source.trim() === "") {
    return { overrides: {}, diagnostics: [] };
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(source);
  } catch (error) {
    const detail = error instanceof Error ? `: ${error.message}` : "";
    return {
      overrides: {},
      diagnostics: [`Could not parse Erin Calendar embed settings${detail}`],
    };
  }

  // Obsidian's YAML parser returns null for a block containing only comments.
  if (parsed === null || parsed === undefined) {
    return { overrides: {}, diagnostics: [] };
  }

  if (!isRecord(parsed)) {
    return {
      overrides: {},
      diagnostics: ["Erin Calendar embed settings must be a YAML mapping."],
    };
  }

  const overrides: EmbedSettingsOverrides = {};
  const diagnostics: string[] = [];
  const target = overrides as Record<string, unknown>;

  for (const [key, value] of Object.entries(parsed)) {
    if (!SETTING_KEYS.has(key as keyof ISettings)) {
      diagnostics.push(`Unknown Erin Calendar embed setting: ${key}.`);
      continue;
    }

    if (key === "wordsPerDot") {
      if (typeof value === "number" && Number.isFinite(value)) {
        target[key] = value;
      } else {
        diagnostics.push("Embed setting wordsPerDot must be a finite number.");
      }
      continue;
    }

    if (key === "calendarView") {
      if (
        typeof value === "string" &&
        CALENDAR_VIEW_OPTIONS.has(value as CalendarViewMode)
      ) {
        target[key] = value;
      } else {
        diagnostics.push("Embed setting calendarView must be month or year.");
      }
      continue;
    }

    if (key === "weekStart") {
      if (typeof value === "string" && WEEK_START_OPTIONS.has(value)) {
        target[key] = value;
      } else {
        diagnostics.push(
          "Embed setting weekStart must be locale, sunday, monday, tuesday, wednesday, thursday, friday, or saturday."
        );
      }
      continue;
    }

    if (isBooleanSettingKey(key)) {
      if (typeof value === "boolean") {
        target[key] = value;
      } else {
        diagnostics.push(`Embed setting ${key} must be true or false.`);
      }
      continue;
    }

    if (isStringSettingKey(key)) {
      if (typeof value === "string") {
        target[key] = value;
      } else {
        diagnostics.push(`Embed setting ${key} must be a string.`);
      }
    }
  }

  return { overrides, diagnostics };
}

/** Returns a per-embed settings object without mutating the global settings. */
export function mergeEmbedSettings(
  globalSettings: ISettings,
  overrides: EmbedSettingsOverrides
): ISettings {
  return { ...globalSettings, ...overrides };
}
