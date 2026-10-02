import moment, { Moment } from "moment";
import "moment/locale/en-gb";
import type { TFile } from "obsidian";

let mockWeeklyNoteSettings = {
  folder: "External Weeks",
  format: "GGGG-[W]WW",
  template: "Templates/External Week.md",
};
let mockMarkdownFiles: TFile[] = [];

jest.mock(
  "obsidian",
  () => ({
    normalizePath: (path: string) => path,
  }),
  { virtual: true }
);

jest.mock(
  "obsidian-daily-notes-interface",
  () => ({
    DEFAULT_WEEKLY_NOTE_FORMAT: "gggg-[W]ww",
    getDateUID: (date: Moment, granularity: "week") =>
      `${granularity}-${date.clone().startOf(granularity).format("YYYY-MM-DD")}`,
    getWeeklyNoteSettings: () => mockWeeklyNoteSettings,
  }),
  { virtual: true }
);

import {
  getAllWeeklyNotesIndex,
  getDateFromWeeklyNoteFile,
  getWeeklyNoteForDate,
} from "./weeklyNotesIndex";
import {
  formatWeeklyNoteDate,
  resolveWeeklyNoteSettings,
} from "./weeklyNoteSettings";
import { getDefaultSettings } from "src/testUtils/settings";

function file(path: string): TFile {
  return { path } as TFile;
}

beforeEach(() => {
  mockWeeklyNoteSettings = {
    folder: "External Weeks",
    format: "GGGG-[W]WW",
    template: "Templates/External Week.md",
  };
  mockMarkdownFiles = [];
  (window as unknown as { moment: typeof moment }).moment = moment;
  (window as unknown as {
    app: { vault: { getMarkdownFiles: () => TFile[] } };
  }).app = {
    vault: { getMarkdownFiles: () => mockMarkdownFiles },
  };
});

it("merges empty Calendar weekly settings with the external settings", () => {
  expect(
    resolveWeeklyNoteSettings({
      weeklyNoteFormat: "",
      weeklyNoteFolder: "  Personal Weeks  ",
      weeklyNoteTemplate: "",
    })
  ).toEqual({
    format: "GGGG-[W]WW",
    folder: "Personal Weeks",
    template: "Templates/External Week.md",
  });
});

it("indexes and resolves a note using the supplied embed weekly settings", () => {
  const embeddedNote = file("Personal Weeks/2024-W22.md");
  const unrelatedNote = file("External Weeks/2024-W22.md");
  const settings = {
    weeklyNoteFormat: "GGGG-[W]WW",
    weeklyNoteFolder: "Personal Weeks",
    weeklyNoteTemplate: "Templates/Personal Week.md",
  };
  mockMarkdownFiles = [embeddedNote, unrelatedNote];

  expect(getDateFromWeeklyNoteFile(embeddedNote, settings)?.format("GGGG-[W]WW")).toBe(
    "2024-W22"
  );
  expect(getDateFromWeeklyNoteFile(unrelatedNote, settings)).toBeNull();

  const index = getAllWeeklyNotesIndex(settings);
  expect(
    getWeeklyNoteForDate(
      moment("2024-05-28", "YYYY-MM-DD", true),
      index,
      settings
    )
  ).toBe(embeddedNote);
});

it("uses the caller's configured week-start date for canonical path lookup", () => {
  const sundayWeeklyNote = file("Personal Weeks/2024-05-26.md");
  const settings = {
    weeklyNoteFormat: "YYYY-MM-DD",
    weeklyNoteFolder: "Personal Weeks",
  };
  mockMarkdownFiles = [sundayWeeklyNote];
  const index = getAllWeeklyNotesIndex(settings);

  expect(
    getWeeklyNoteForDate(
      moment("2024-05-26", "YYYY-MM-DD", true),
      index,
      settings
    )
  ).toBe(sundayWeeklyNote);
});

it("indexes locale-sensitive weekly formats with the embed locale", () => {
  const embeddedNote = file("Personal Weeks/2021-W01.md");
  const settings = getDefaultSettings({
    localeOverride: "en-gb",
    weekStart: "locale",
    weeklyNoteFormat: "gggg-[W]ww",
    weeklyNoteFolder: "Personal Weeks",
  });
  mockMarkdownFiles = [embeddedNote];

  expect(
    getDateFromWeeklyNoteFile(embeddedNote, settings)?.format("YYYY-MM-DD")
  ).toBe("2021-01-04");

  const index = getAllWeeklyNotesIndex(settings);
  expect(
    getWeeklyNoteForDate(
      moment("2021-01-04", "YYYY-MM-DD", true).locale("en-gb"),
      index,
      settings
    )
  ).toBe(embeddedNote);
});

it("uses an explicit week start for local week tokens without changing Moment globally", () => {
  const settings = getDefaultSettings({
    localeOverride: "en-gb",
    weekStart: "sunday",
    weeklyNoteFormat: "gggg-[W]ww",
    weeklyNoteFolder: "Personal Weeks",
  });
  moment.locale("en");

  expect(
    formatWeeklyNoteDate(
      moment("2021-01-03", "YYYY-MM-DD", true),
      "gggg-[W]ww",
      settings
    )
  ).toBe("2021-W01");
  expect(moment.locale()).toBe("en");

  const embeddedNote = file("Personal Weeks/2021-W01.md");
  mockMarkdownFiles = [embeddedNote];
  const index = getAllWeeklyNotesIndex(settings);
  expect(
    getWeeklyNoteForDate(
      moment("2021-01-03", "YYYY-MM-DD", true),
      index,
      settings
    )
  ).toBe(embeddedNote);
});
