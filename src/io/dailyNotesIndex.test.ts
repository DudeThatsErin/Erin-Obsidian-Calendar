import moment, { Moment } from "moment";
import type { TFile } from "obsidian";

let mockDailyNoteSettings = {
  folder: "journal",
  format: "YYYY/MM/DD",
};
let mockMarkdownFiles: TFile[] = [];
let mockFrontmatter: Record<string, Record<string, unknown>> = {};

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
  getAllDailyNotesIndex,
  getAllDailyNotesByPath,
  getDailyNotesForDate,
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
  mockFrontmatter = {};
  (window as unknown as { moment: typeof moment }).moment = moment;
  (window as unknown as {
    app: {
      metadataCache: { getFileCache: (file: TFile) => { frontmatter: Record<string, unknown> } };
      vault: { getMarkdownFiles: () => TFile[] };
    };
  }).app = {
    metadataCache: {
      getFileCache: (note) => ({ frontmatter: mockFrontmatter[note.path] }),
    },
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

  it("finds one monthly-format note from any day in that month", () => {
    mockDailyNoteSettings = { folder: "journal", format: "YYYYMM" };
    const monthlyNote = file("journal/202403.md");
    mockMarkdownFiles = [monthlyNote];

    const notes = getAllDailyNotesIndex();
    expect(
      getDailyNotesForDate(moment("2024-03-21", "YYYY-MM-DD", true), notes)
    ).toEqual([monthlyNote]);
  });

  it("accepts a quoted literal in a Daily Notes filename format", () => {
    mockDailyNoteSettings = {
      folder: "journal",
      format: "YY.WW.MM.DD[ - ]dddd['s Daily Note]",
    };
    const note = file("journal/24.18.05.03 - Friday's Daily Note.md");
    mockMarkdownFiles = [note];

    expect(getDateFromDailyNoteFile(note)?.format("YYYY-MM-DD")).toBe(
      "2024-05-03"
    );
    expect(
      getDailyNotesForDate(moment("2024-05-03", "YYYY-MM-DD", true), getAllDailyNotesIndex())
    ).toEqual([note]);
  });

  it("groups multiple imported notes by a configured frontmatter date", () => {
    const first = file("imports/first.md");
    const second = file("imports/second.md");
    mockMarkdownFiles = [first, second];
    mockFrontmatter = {
      "imports/first.md": { created: "2020-01-15T10:00:00.000Z" },
      "imports/second.md": { created: "2020-01-15" },
    };

    const index = getAllDailyNotesIndex({
      metadataDateFormat: "YYYY-MM-DD",
      metadataDateProperty: "created",
      useMetadataDates: true,
    });
    expect(
      getDailyNotesForDate(moment("2020-01-15", "YYYY-MM-DD", true), index).map(
        (note) => note.path
      )
    ).toEqual(["imports/first.md", "imports/second.md"]);
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
