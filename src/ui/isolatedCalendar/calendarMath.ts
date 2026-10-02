import type { Moment } from "moment";

import { withCalendarLocale } from "./locale";

export interface ICalendarWeek {
  days: Moment[];
  weekNum: number;
}

export type ICalendarMonth = ICalendarWeek[];

function daysInYear(year: number): number {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
    ? 366
    : 365;
}

// This is Moment's week-number calculation expressed without updating a
// Moment locale. `doy` remains locale-specific while `dow` is per embed.
function firstWeekOffset(year: number, dow: number, doy: number): number {
  const firstWeekDay = 7 + dow - doy;
  const localWeekday =
    (7 + new Date(Date.UTC(year, 0, firstWeekDay)).getUTCDay() - dow) % 7;
  return -localWeekday + firstWeekDay - 1;
}

function weeksInYear(year: number, dow: number, doy: number): number {
  const thisYearOffset = firstWeekOffset(year, dow, doy);
  const nextYearOffset = firstWeekOffset(year + 1, dow, doy);
  return (daysInYear(year) - thisYearOffset + nextYearOffset) / 7;
}

/** Calculate a locale-style week number for the supplied per-embed week start. */
export function getCalendarWeekNumber(
  date: Moment,
  weekStart: number,
  localeFirstDayOfYear: number
): number {
  const weekOffset = firstWeekOffset(
    date.year(),
    weekStart,
    localeFirstDayOfYear
  );
  let week = Math.floor((date.dayOfYear() - weekOffset - 1) / 7) + 1;

  if (week < 1) {
    week += weeksInYear(date.year() - 1, weekStart, localeFirstDayOfYear);
  } else if (week > weeksInYear(date.year(), weekStart, localeFirstDayOfYear)) {
    week -= weeksInYear(date.year(), weekStart, localeFirstDayOfYear);
  }

  return week;
}

/** Generate the six calendar rows without reading Moment's global locale. */
export function getCalendarMonth(
  displayedMonth: Moment,
  locale: string,
  weekStart: number,
  localeFirstDayOfYear: number
): ICalendarMonth {
  const startOfMonth = withCalendarLocale(displayedMonth, locale)
    .date(1)
    .startOf("day");
  const startOffset = (startOfMonth.day() - weekStart + 7) % 7;
  let date = startOfMonth.clone().subtract(startOffset, "days");
  const month: ICalendarMonth = [];

  for (let dayIndex = 0; dayIndex < 42; dayIndex += 1) {
    if (dayIndex % 7 === 0) {
      month.push({
        days: [],
        weekNum: getCalendarWeekNumber(
          date,
          weekStart,
          localeFirstDayOfYear
        ),
      });
    }

    month[month.length - 1].days.push(date);
    date = date.clone().add(1, "day");
  }

  return month;
}

export function getCalendarWeekStart(date: Moment, weekStart: number): Moment {
  const offset = (date.day() - weekStart + 7) % 7;
  return date.clone().startOf("day").subtract(offset, "days");
}

export function getCalendarDayUID(date: Moment): string {
  return `day-${date.clone().startOf("day").format()}`;
}

export function getCalendarWeekUID(date: Moment, weekStart: number): string {
  return `week-${getCalendarWeekStart(date, weekStart).format()}`;
}

export function isWeekend(date: Moment): boolean {
  return date.isoWeekday() === 6 || date.isoWeekday() === 7;
}
