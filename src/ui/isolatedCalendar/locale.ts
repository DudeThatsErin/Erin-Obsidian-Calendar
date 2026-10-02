import type { Moment } from "moment";
import type {
  ILocaleOverride,
  IWeekStartOption,
} from "obsidian-calendar-ui";

/**
 * Helpers used by the embedded-calendar renderer.
 *
 * `obsidian-calendar-ui` configures Moment globally. That is fine for a
 * single sidebar view, but it makes two embedded calendars race when they use
 * different locale or week-start overrides. Everything in this module works
 * with locale data and per-instance Moment locales instead.
 */

const languageToMomentLocale: Record<string, string> = {
  en: "en-gb",
  zh: "zh-cn",
  "zh-tw": "zh-tw",
  ru: "ru",
  ko: "ko",
  it: "it",
  id: "id",
  ro: "ro",
  "pt-br": "pt-br",
  cz: "cs",
  da: "da",
  de: "de",
  es: "es",
  fr: "fr",
  no: "nn",
  pl: "pl",
  pt: "pt",
  tr: "tr",
  hi: "hi",
  nl: "nl",
  ar: "ar",
  ja: "ja",
};

const weekdays = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

function savedObsidianLanguage(): string {
  try {
    return localStorage.getItem("language")?.toLowerCase() || "en";
  } catch {
    return "en";
  }
}

function availableLocale(requestedLocale: string): string | null {
  const requested = requestedLocale.toLowerCase();
  const locales = window.moment.locales();

  return (
    locales.find((locale) => locale.toLowerCase() === requested) ||
    locales.find((locale) => locale.toLowerCase() === requested.split("-")[0]) ||
    null
  );
}

/**
 * Resolve the locale without calling `moment.locale(name)`, whose static form
 * changes Moment's process-wide default locale.
 */
export function resolveCalendarLocale(
  localeOverride: ILocaleOverride = "system-default"
): string {
  const obsidianLanguage = savedObsidianLanguage();
  const systemLanguage = navigator.language?.toLowerCase();
  let requestedLocale = languageToMomentLocale[obsidianLanguage] || obsidianLanguage;

  if (localeOverride !== "system-default") {
    requestedLocale = localeOverride;
  } else if (systemLanguage?.startsWith(obsidianLanguage)) {
    requestedLocale = systemLanguage;
  }

  // `locales()` is read-only. Prefer English over Moment's ambient default if
  // the requested locale has not been bundled by Obsidian.
  return availableLocale(requestedLocale) || availableLocale("en") || "en";
}

/** Return the Sunday-based day index for an embed's own week-start choice. */
export function getCalendarWeekStartIndex(
  locale: string,
  weekStart: IWeekStartOption = "locale"
): number {
  const explicitWeekStart = weekdays.indexOf(
    weekStart as (typeof weekdays)[number]
  );
  if (explicitWeekStart !== -1) {
    return explicitWeekStart;
  }

  return window.moment.localeData(locale).firstDayOfWeek();
}

/**
 * Localize an individual Moment without modifying the global Moment locale.
 */
export function withCalendarLocale(date: Moment, locale: string): Moment {
  return date.clone().locale(locale);
}

/**
 * Format weekday headings in the same order as the isolated calendar grid.
 * Moment's `d` token is numeric, while the Calendar setting historically uses
 * it as a shorthand for a single visible letter.
 */
export function getCalendarWeekdayLabels(
  date: Moment,
  locale: string,
  weekStart: number,
  format = "ddd"
): string[] {
  const normalizedFormat = format.trim() || "ddd";
  const momentFormat = normalizedFormat === "d" ? "dd" : normalizedFormat;
  const firstDay = withCalendarLocale(date, locale)
    .startOf("day")
    .day(weekStart);

  return Array.from({ length: 7 }, (_value, index) => {
    const label = firstDay.clone().add(index, "day").format(momentFormat);
    return normalizedFormat === "d" ? Array.from(label)[0] || label : label;
  });
}
