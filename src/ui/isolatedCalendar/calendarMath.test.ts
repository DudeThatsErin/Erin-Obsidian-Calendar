import moment from "moment";
import "moment/locale/en-gb";

import {
  getCalendarMonth,
  getCalendarWeekNumber,
  getCalendarWeekStart,
} from "./calendarMath";
import {
  getCalendarWeekStartIndex,
  getCalendarWeekdayLabels,
  resolveCalendarLocale,
} from "./locale";

beforeEach(() => {
  (window as unknown as { moment: typeof moment }).moment = moment;
  moment.locale("en");
  localStorage.setItem("language", "en");
});

describe("isolated calendar date math", () => {
  it("creates independent Sunday and Monday grids without changing Moment's global locale", () => {
    const before = moment.locale();
    const displayedMonth = moment("2020-01-15", "YYYY-MM-DD", true);

    const sunday = getCalendarMonth(displayedMonth, "en", 0, 6);
    const monday = getCalendarMonth(displayedMonth, "en", 1, 6);

    expect(sunday[0].days[0].format("YYYY-MM-DD")).toBe("2019-12-29");
    expect(monday[0].days[0].format("YYYY-MM-DD")).toBe("2019-12-30");
    expect(moment.locale()).toBe(before);
  });

  it("uses the embedded week start for headings and week actions", () => {
    const date = moment("2024-05-15", "YYYY-MM-DD", true);

    expect(getCalendarWeekdayLabels(date, "en", 0, "d")).toEqual([
      "S",
      "M",
      "T",
      "W",
      "T",
      "F",
      "S",
    ]);
    expect(getCalendarWeekdayLabels(date, "en", 1, "ddd")[0]).toBe("Mon");
    expect(getCalendarWeekStart(date, 1).format("YYYY-MM-DD")).toBe(
      "2024-05-13"
    );
  });

  it("preserves locale week-number rules while using a per-calendar start day", () => {
    const locale = "en-gb";
    const localeData = moment.localeData(locale);
    const date = moment("2021-01-01", "YYYY-MM-DD", true).locale(locale);

    expect(
      getCalendarWeekNumber(
        date,
        getCalendarWeekStartIndex(locale, "locale"),
        localeData.firstDayOfYear()
      )
    ).toBe(53);
  });

  it("resolves an available locale without switching Moment's global default", () => {
    const before = moment.locale();

    expect(resolveCalendarLocale("en-gb")).toBe("en-gb");
    expect(moment.locale()).toBe(before);
  });
});
