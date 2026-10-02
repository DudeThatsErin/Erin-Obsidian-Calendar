import moment, { Moment } from "moment";
import type { TFile } from "obsidian";

let mockDailyNoteSettings = {
  folder: "journal",
  format: "YYYY/MM/DD",
};
let mockMarkdownFiles: TFile[] = [];

jest.mock(
  "obsidian",
  () => ({
    normalizePath: (path: string) => path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""),
  }),
  { virtual: true }
);

jest.mock(
  "obsidian-daily-notes-interface",
  () => ({
    DEFAULT_DAILY_NOTE_FORMAT: "YYYY-MM-DD",
    getDailyNoteSettings: () => mockDailyNoteSettings,
    getDateUID: (date: Moment, granularity: "day") =>
      `${granularity}-${date.clone().startOf(granularity).format()}`,
  }),
  { virtual: true }
);

import {
  getAdjacentDailyNote,
  getAllDailyNotesByPath,
  getDateFromDailyNoteFile,
} from "./dailyNotesIndex";

function file(path: string): TFile {
  return { path } as TFile;
}

beforeEach(() => {
  mockDailyNoteSettings = {
    folder: "journal",
    format: "YYYY/MM/DD",
  };
  mockMarkdownFiles = [];
  (window as unknown as { moment: typeof moment }).moment = moment;
  (window as unknown as {
    app: { vault: { getMarkdownFiles: () => TFile[] } };
  }).app = {
    vault: {
      getMarkdownFiles: () => mockMarkdownFiles,
    },
  };
});

describe("daily note paths", () => {
  it("recognizes notes whose configured date format contains folders", () => {
    const date = getDateFromDailyNoteFile(file("journal/2024/07/05.md"));

    expect(date?.format("YYYY-MM-DD")).toBe("2024-07-05");
  });

  it("rejects notes outside the daily note folder or with an invalid date", () => {
    expect(getDateFromDailyNoteFile(file("other/2024/07/05.md"))).toBeNull();
    expect(getDateFromDailyNoteFile(file("journal/2024/07/99.md"))).toBeNull();
  });

  it("indexes only matching daily note paths", () => {
    mockMarkdownFiles = [
      file("journal/2024/07/05.md"),
      file("journal/2024/07/06.md"),
      file("journal/not-a-date.md"),
      file("other/2024/07/07.md"),
    ];

    expect(Object.values(getAllDailyNotesByPath()).map((note) => note.path)).toEqual([
      "journal/2024/07/05.md",
      "journal/2024/07/06.md",
    ]);
  });
});

describe("existing daily note navigation", () => {
  const current = () => moment("2024/07/10", "YYYY/MM/DD", true);

  it("finds the nearest defined days and skips empty days", () => {
    mockMarkdownFiles = [
      file("journal/2024/07/13.md"),
      file("journal/2024/07/02.md"),
      file("journal/2024/07/08.md"),
    ];
    const notes = getAllDailyNotesByPath();

    expect(getAdjacentDailyNote(current(), notes, "previous")?.file.path).toBe(
      "journal/2024/07/08.md"
    );
    expect(getAdjacentDailyNote(current(), notes, "next")?.file.path).toBe(
      "journal/2024/07/13.md"
    );
  });

  it("does not return the current day or cross the ends of the list", () => {
    mockMarkdownFiles = [
      file("journal/2024/07/10.md"),
      file("journal/2024/07/13.md"),
    ];
    const notes = getAllDailyNotesByPath();

    expect(getAdjacentDailyNote(current(), notes, "previous")).toBeNull();
    expect(
      getAdjacentDailyNote(
        moment("2024/07/13", "YYYY/MM/DD", true),
        notes,
        "next"
      )
    ).toBeNull();
  });
});
