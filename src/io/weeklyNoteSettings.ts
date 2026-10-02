import type { Moment } from "moment";
import {
  DEFAULT_WEEKLY_NOTE_FORMAT,
  getWeeklyNoteSettings,
} from "obsidian-daily-notes-interface";
import type { IPeriodicNoteSettings } from "obsidian-daily-notes-interface";

import type { ISettings } from "src/settings";
import {
  getCalendarWeekStartIndex,
  resolveCalendarLocale,
} from "src/ui/isolatedCalendar/locale";

/** The three Weekly Note options that may be overridden by an embed. */
export type WeeklyNoteSettingsInput =
  | Partial<
      Pick<
        ISettings,
        "weeklyNoteFolder" | "weeklyNoteFormat" | "weeklyNoteTemplate"
      >
    >
  | Partial<IPeriodicNoteSettings>;

/** A complete Weekly Note configuration that is safe to use for paths. */
export interface ResolvedWeeklyNoteSettings {
  folder: string;
  format: string;
  template: string;
}

interface MomentLocaleInternals {
  _week?: {
    dow?: number;
    doy?: number;
  };
}

function getCalendarSettings(
  settings?: WeeklyNoteSettingsInput
): Pick<ISettings, "localeOverride" | "weekStart"> | null {
  const candidate = settings as Partial<ISettings> | undefined;
  if (typeof candidate?.weekStart !== "string") {
    return null;
  }

  return {
    localeOverride: candidate.localeOverride || "system-default",
    weekStart: candidate.weekStart,
  } as Pick<ISettings, "localeOverride" | "weekStart">;
}

/**
 * Get a named Moment locale whose week rule belongs to one Calendar instance.
 * Defining a locale briefly changes Moment's default, so restore it before
 * returning; all later work explicitly selects the returned locale per date.
 */
export function resolveWeeklyMomentLocale(
  settings?: WeeklyNoteSettingsInput
): string | null {
  const calendarSettings = getCalendarSettings(settings);
  if (!calendarSettings) {
    return null;
  }

  const locale = resolveCalendarLocale(calendarSettings.localeOverride);
  if (calendarSettings.weekStart === "locale") {
    return locale;
  }

  const weekStart = getCalendarWeekStartIndex(
    locale,
    calendarSettings.weekStart
  );
  const customLocale = `erin-calendar-${locale}-dow-${weekStart}`;
  if (window.moment.locales().includes(customLocale)) {
    return customLocale;
  }

  const baseLocale = window.moment.localeData(locale) as unknown as MomentLocaleInternals;
  const previousLocale = window.moment.locale();
  try {
    window.moment.defineLocale(customLocale, {
      parentLocale: locale,
      week: {
        ...(baseLocale._week || {}),
        dow: weekStart,
      },
    });
  } finally {
    window.moment.locale(previousLocale);
  }
  return customLocale;
}

/** Return a clone whose native Moment week tokens honor this calendar. */
export function withWeeklyMomentLocale(
  date: Moment,
  settings?: WeeklyNoteSettingsInput
): Moment {
  const locale = resolveWeeklyMomentLocale(settings);
  return locale ? date.clone().locale(locale) : date.clone();
}

/** Format a weekly note path without changing Moment's ambient locale. */
export function formatWeeklyNoteDate(
  date: Moment,
  format: string,
  settings?: WeeklyNoteSettingsInput
): string {
  return withWeeklyMomentLocale(date, settings).format(format);
}

/** Build the selection/index key using this calendar's own week rule. */
export function getWeeklyNoteDateUID(
  date: Moment,
  settings?: WeeklyNoteSettingsInput
): string {
  return `week-${withWeeklyMomentLocale(date, settings)
    .startOf("week")
    .format()}`;
}

function stringSetting(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Merge this plugin's optional Weekly Note settings with the Calendar or
 * Periodic Notes settings exposed by obsidian-daily-notes-interface.
 *
 * Empty strings intentionally mean "inherit". That keeps the existing
 * sidebar behaviour while allowing a calendar embed to override any subset
 * of the three settings.
 */
export function resolveWeeklyNoteSettings(
  settings?: WeeklyNoteSettingsInput
): ResolvedWeeklyNoteSettings {
  const overrides = settings as Partial<
    Pick<
      ISettings,
      "weeklyNoteFolder" | "weeklyNoteFormat" | "weeklyNoteTemplate"
    >
  >;
  const directSettings = settings as Partial<IPeriodicNoteSettings>;
  const fallback = getWeeklyNoteSettings() || {};

  return {
    format:
      stringSetting(overrides?.weeklyNoteFormat) ||
      stringSetting(directSettings?.format) ||
      stringSetting(fallback.format) ||
      DEFAULT_WEEKLY_NOTE_FORMAT,
    folder:
      stringSetting(overrides?.weeklyNoteFolder) ||
      stringSetting(directSettings?.folder) ||
      stringSetting(fallback.folder),
    template:
      stringSetting(overrides?.weeklyNoteTemplate) ||
      stringSetting(directSettings?.template) ||
      stringSetting(fallback.template),
  };
}
