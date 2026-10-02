import moment from "moment";
import "moment/locale/en-gb";
import type { TFile } from "obsidian";

let mockWeeklyNoteSettings = {
  folder: "External Weeks",
  format: "GGGG-[W]WW",
  template: "Templates/External Week.md",
};
const mockGetTemplateInfo = jest.fn();
const mockGetNoteLeaf = jest.fn();

class MockNotice {
  constructor(_message: string) {}
}

jest.mock(
  "obsidian",
  () => ({
    normalizePath: (path: string) => path,
    Notice: MockNotice,
    TFile: class {},
  }),
  { virtual: true }
);

jest.mock(
  "obsidian-daily-notes-interface",
  () => ({
    DEFAULT_WEEKLY_NOTE_FORMAT: "gggg-[W]ww",
    getTemplateInfo: (...args: string[]) => mockGetTemplateInfo(...args),
    getWeeklyNoteSettings: () => mockWeeklyNoteSettings,
  }),
  { virtual: true }
);

jest.mock("src/ui/modal", () => ({
  createConfirmationDialog: jest.fn(),
}));

jest.mock("./workspace", () => ({
  getNoteLeaf: (...args: unknown[]) => mockGetNoteLeaf(...args),
}));

import {
  createCalendarWeeklyNote,
  expandWeeklyNoteTemplate,
  tryToCreateWeeklyNote,
} from "./weeklyNotes";
import { getDefaultSettings } from "src/testUtils/settings";

beforeEach(() => {
  mockWeeklyNoteSettings = {
    folder: "External Weeks",
    format: "GGGG-[W]WW",
    template: "Templates/External Week.md",
  };
  mockGetTemplateInfo.mockReset();
  mockGetNoteLeaf.mockReset();
  (window as unknown as { moment: typeof moment }).moment = (() =>
    moment("2024-05-20T09:10:00")) as typeof moment;
});

it("creates a weekly note using the per-calendar format, folder, and template", async () => {
  const createdFile = { path: "Personal/Weeks/2024-W22.md" } as TFile;
  const create = jest.fn().mockResolvedValue(createdFile);
  const createFolder = jest.fn().mockResolvedValue(undefined);
  const save = jest.fn();
  mockGetTemplateInfo.mockResolvedValue([
    "date: {{date}}\\ntitle: {{title}}\\ntime: {{time}}\\nnext: {{date+1d:YYYY-MM-DD}}",
    { folds: [] },
  ]);
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
    createCalendarWeeklyNote(moment("2024-05-27", "YYYY-MM-DD", true), {
      weeklyNoteFormat: "GGGG-[W]WW",
      weeklyNoteFolder: "Personal/Weeks",
      weeklyNoteTemplate: "Templates/Personal Week.md",
    })
  ).resolves.toBe(createdFile);

  expect(mockGetTemplateInfo).toHaveBeenCalledWith("Templates/Personal Week.md");
  expect(createFolder).toHaveBeenCalledWith("Personal/Weeks");
  expect(create).toHaveBeenCalledWith(
    "Personal/Weeks/2024-W22.md",
    "date: 2024-W22\\ntitle: 2024-W22\\ntime: 09:10\\nnext: 2024-05-28"
  );
  expect(save).toHaveBeenCalledWith(createdFile, { folds: [] });
});

it("inherits missing weekly fields from the external settings", async () => {
  const createdFile = { path: "External Weeks/2024-W22.md" } as TFile;
  const create = jest.fn().mockResolvedValue(createdFile);
  mockGetTemplateInfo.mockResolvedValue(["", null]);
  (window as unknown as {
    app: {
      vault: {
        create: typeof create;
        createFolder: () => Promise<void>;
        getAbstractFileByPath: () => object;
      };
      foldManager: { save: () => void };
    };
  }).app = {
    vault: {
      create,
      createFolder: () => Promise.resolve(),
      getAbstractFileByPath: () => ({}),
    },
    foldManager: { save: () => undefined },
  };

  await createCalendarWeeklyNote(moment("2024-05-27", "YYYY-MM-DD", true), {
    weeklyNoteFormat: "",
    weeklyNoteFolder: "",
    weeklyNoteTemplate: "",
  });

  expect(mockGetTemplateInfo).toHaveBeenCalledWith("Templates/External Week.md");
  expect(create).toHaveBeenCalledWith("External Weeks/2024-W22.md", "");
});

it("uses the same resolved settings when tryToCreateWeeklyNote opens the new file", async () => {
  const createdFile = { path: "Embedded/2024-W22.md" } as TFile;
  const create = jest.fn().mockResolvedValue(createdFile);
  const openFile = jest.fn().mockResolvedValue(undefined);
  mockGetTemplateInfo.mockResolvedValue(["", null]);
  mockGetNoteLeaf.mockReturnValue({ openFile });
  (window as unknown as {
    app: {
      vault: {
        create: typeof create;
        createFolder: () => Promise<void>;
        getAbstractFileByPath: () => object;
      };
      foldManager: { save: () => void };
    };
  }).app = {
    vault: {
      create,
      createFolder: () => Promise.resolve(),
      getAbstractFileByPath: () => ({}),
    },
    foldManager: { save: () => undefined },
  };
  // This test does not exercise template time replacement, so retain Moment's
  // locale APIs for the per-calendar weekly-format path.
  (window as unknown as { moment: typeof moment }).moment = moment;

  await tryToCreateWeeklyNote(
    moment("2024-05-27", "YYYY-MM-DD", true),
    true,
    getDefaultSettings({
      weeklyNoteFormat: "GGGG-[W]WW",
      weeklyNoteFolder: "Embedded",
      weeklyNoteTemplate: "Templates/Embedded.md",
    })
  );

  expect(create).toHaveBeenCalledWith("Embedded/2024-W22.md", "");
  expect(openFile).toHaveBeenCalledWith(createdFile, { active: true });
});

it("keeps date, time, and selected weekday template tokens useful", () => {
  const selectedDate = moment("2024-05-27", "YYYY-MM-DD", true);
  const createdAt = moment("2024-05-20T09:10:00");
  (window as unknown as { moment: typeof moment }).moment = moment;

  expect(
    expandWeeklyNoteTemplate(
      "{{date}} | {{time}} | {{title}} | {{date+2d:YYYY-MM-DD}} | {{monday:ddd}}",
      selectedDate,
      "GGGG-[W]WW",
      createdAt
    )
  ).toBe("2024-W22 | 09:10 | 2024-W22 | 2024-05-29 | Mon");
});

it("uses the embedded week rule for named weekday template tokens", () => {
  (window as unknown as { moment: typeof moment }).moment = moment;
  const selectedDate = moment("2021-01-03", "YYYY-MM-DD", true).locale(
    "en-gb"
  );

  expect(
    expandWeeklyNoteTemplate(
      "{{sunday:ddd}} | {{monday:ddd}}",
      selectedDate,
      "gggg-[W]ww",
      moment("2021-01-03T09:10:00"),
      getDefaultSettings({
        localeOverride: "en-gb",
        weekStart: "sunday",
      })
    )
  ).toBe("Sun | Mon");
});
