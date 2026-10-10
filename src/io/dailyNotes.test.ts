import moment from "moment";

let mockDailyNoteSettings = {
  folder: "Journal",
  format: "YYYY-MM-DD",
  template: "Templates/Daily.md",
};
const mockGetTemplateInfo = jest.fn();

class MockNotice {}

jest.mock(
  "obsidian",
  () => ({
    normalizePath: (path: string) => path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""),
    Notice: MockNotice,
    TFile: class {},
  }),
  { virtual: true }
);

jest.mock(
  "obsidian-daily-notes-interface",
  () => ({
    getDailyNoteSettings: () => mockDailyNoteSettings,
    getTemplateInfo: (...args: string[]) => mockGetTemplateInfo(...args),
  }),
  { virtual: true }
);

jest.mock("src/ui/modal", () => ({
  createConfirmationDialog: jest.fn(),
}));

import {
  buildMonthlyJournalEntry,
  createCalendarDailyNote,
  expandDailyNoteTemplate,
} from "./dailyNotes";

beforeEach(() => {
  mockDailyNoteSettings = {
    folder: "Journal",
    format: "YYYY-MM-DD",
    template: "Templates/Daily.md",
  };
  mockGetTemplateInfo.mockReset();
  (window as unknown as { moment: typeof moment }).moment = (() =>
    moment("2024-10-16T13:45:00")) as typeof moment;
});

it("uses the creation date for bare {{date}} while preserving selected-date tokens", () => {
  const selectedDate = moment("2024-10-20", "YYYY-MM-DD", true);
  const createdAt = moment("2024-10-16T13:45:00");

  expect(
    expandDailyNoteTemplate(
      "date: {{date}}\ntime: {{time}}\ntitle: {{title}}\nnext: {{date+1d:YYYY-MM-DD}}\nyesterday: {{yesterday}}",
      selectedDate,
      "YYYY-MM-DD",
      createdAt
    )
  ).toBe(
    "date: 2024-10-16\ntime: 13:45\ntitle: 2024-10-20\nnext: 2024-10-21\nyesterday: 2024-10-19"
  );
});

it("groups entries under one date heading with time subheadings", () => {
  const date = moment("2026-10-10", "YYYY-MM-DD", true);
  const firstEntry = buildMonthlyJournalEntry(
    "---\nbanner: test\n---\n",
    date,
    moment("2026-10-10T09:05:00")
  );
  const secondEntry = buildMonthlyJournalEntry(
    firstEntry,
    date,
    moment("2026-10-10T16:30:00")
  );

  expect(firstEntry).toContain("# Saturday, Oct 10\n\n## 9:05 AM");
  expect(secondEntry).toContain("## 9:05 AM\n\n## 4:30 PM");
  expect(secondEntry.match(/^# Saturday, Oct 10$/gm)).toHaveLength(1);
});

it("keeps the target filename and creates nested date paths", async () => {
  mockDailyNoteSettings = {
    folder: "Journal",
    format: "YYYY/MM/DD",
    template: "Templates/Daily.md",
  };

  const createdFile = { path: "Journal/2024/10/20.md" };
  const create = jest.fn().mockResolvedValue(createdFile);
  const createFolder = jest.fn().mockResolvedValue(undefined);
  const save = jest.fn();
  mockGetTemplateInfo.mockResolvedValue(["created: {{date}}\ntitle: {{title}}", { folds: [] }]);
  (window as unknown as {
    app: {
      vault: {
        create: typeof create;
        createFolder: typeof createFolder;
        getAbstractFileByPath: () => null;
      };
      foldManager: { save: typeof save };
    };
  }).app = {
    vault: {
      create,
      createFolder,
      getAbstractFileByPath: () => null,
    },
    foldManager: { save },
  };

  await expect(
    createCalendarDailyNote(moment("2024/10/20", "YYYY/MM/DD", true))
  ).resolves.toBe(createdFile);

  expect(createFolder).toHaveBeenCalledWith("Journal/2024/10");
  expect(create).toHaveBeenCalledWith(
    "Journal/2024/10/20.md",
    "created: 2024/10/16\ntitle: 2024/10/20"
  );
  expect(save).toHaveBeenCalledWith(createdFile, { folds: [] });
});
