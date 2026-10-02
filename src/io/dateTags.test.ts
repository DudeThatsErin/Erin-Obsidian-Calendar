import moment, { Moment } from "moment";
import type { TFile } from "obsidian";

let mockFiles: TFile[] = [];
let mockContents: Record<string, string> = {};
let mockTags: Record<string, string[]> = {};

jest.mock(
  "obsidian",
  () => ({
    getAllTags: (cache: { tags?: string[] }) => cache.tags || null,
  }),
  { virtual: true }
);

jest.mock(
  "obsidian-daily-notes-interface",
  () => ({
    getDateUID: (date: Moment, granularity: "day") =>
      `${granularity}-${date.clone().startOf(granularity).format("YYYY-MM-DD")}`,
  }),
  { virtual: true }
);

import { getAllDateTags, getDateTagEntries } from "./dateTags";

function file(path: string): TFile {
  const basename = path.split("/").pop()?.replace(/\.md$/, "") || "";
  return { path, basename } as TFile;
}

beforeEach(() => {
  mockFiles = [];
  mockContents = {};
  mockTags = {};
  (window as unknown as { moment: typeof moment }).moment = moment;
  (window as unknown as {
    app: {
      metadataCache: { getFileCache: (file: TFile) => { tags: string[] } };
      vault: {
        cachedRead: (file: TFile) => Promise<string>;
        getMarkdownFiles: () => TFile[];
      };
    };
  }).app = {
    metadataCache: {
      getFileCache: (note) => ({ tags: mockTags[note.path] || [] }),
    },
    vault: {
      cachedRead: async (note) => mockContents[note.path] || "",
      getMarkdownFiles: () => mockFiles,
    },
  };
});

it("indexes exact date tags and exposes their following task summaries", async () => {
  const note = file("Projects/Algernon.md");
  mockFiles = [note];
  mockTags = { "Projects/Algernon.md": ["#2023-12-05", "#project"] };
  mockContents = {
    "Projects/Algernon.md": [
      "# Some random project notes",
      "#2023-12-05",
      "- event: bring flowers for algernon",
      "  - [ ] buy flowers",
    ].join("\n"),
  };

  const index = await getAllDateTags();
  expect(
    getDateTagEntries(moment("2023-12-05", "YYYY-MM-DD", true), index)
  ).toEqual([
    expect.objectContaining({
      description: "event: bring flowers for algernon · buy flowers",
      file: note,
    }),
  ]);
});

it("ignores tags which are not exact ISO calendar dates", async () => {
  const note = file("Projects/Other.md");
  mockFiles = [note];
  mockTags = { "Projects/Other.md": ["#2023-12", "#2023-12-050"] };

  const index = await getAllDateTags();
  expect(Object.values(index.entriesByDate)).toHaveLength(0);
});
