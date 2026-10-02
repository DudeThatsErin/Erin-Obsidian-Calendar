let parseYamlResult: unknown = {};
const mockParseYaml = jest.fn((_source: string) => parseYamlResult);

jest.mock(
  "obsidian",
  () => ({
    parseYaml: (source: string) => mockParseYaml(source),
  }),
  { virtual: true }
);

import {
  mergeEmbedSettings,
  parseEmbedSettings,
} from "./embedSettings";
import type { ISettings } from "./settings";

function settings(overrides: Partial<ISettings> = {}): ISettings {
  return {
    calendarView: "month",
    wordsPerDot: 50,
    weekdayLabelFormat: "ddd",
    weekStart: "locale",
    shouldConfirmBeforeCreate: true,
    showMonthlyNote: false,
    showQuarterlyNote: false,
    showYearlyNote: false,
    showWeeklyNote: false,
    weeklyNoteFormat: "",
    weeklyNoteTemplate: "",
    weeklyNoteFolder: "",
    showDateTags: true,
    useMetadataDates: false,
    metadataDateProperty: "date",
    metadataDateFormat: "YYYY-MM-DD",
    localeOverride: "system-default",
    ...overrides,
  };
}

beforeEach(() => {
  parseYamlResult = {};
  mockParseYaml.mockReset();
  mockParseYaml.mockImplementation(() => parseYamlResult);
});

describe("parseEmbedSettings", () => {
  it("accepts every calendar setting as a partial YAML override", () => {
    parseYamlResult = {
      calendarView: "year",
      wordsPerDot: 12,
      weekdayLabelFormat: "dd",
      weekStart: "monday",
      shouldConfirmBeforeCreate: false,
      showMonthlyNote: true,
      showQuarterlyNote: true,
      showYearlyNote: true,
      showWeeklyNote: true,
      weeklyNoteFormat: "GGGG-[W]WW",
      weeklyNoteTemplate: "Templates/Week",
      weeklyNoteFolder: "Weekly",
      showDateTags: false,
      useMetadataDates: true,
      metadataDateProperty: "created",
      metadataDateFormat: "YYYY-MM-DD HH:mm",
      localeOverride: "en-gb",
    };

    const result = parseEmbedSettings("weekStart: monday");

    expect(mockParseYaml).toHaveBeenCalledWith("weekStart: monday");
    expect(result.diagnostics).toEqual([]);
    expect(result.overrides).toEqual(parseYamlResult);
  });

  it("keeps valid settings while diagnosing invalid and unknown values", () => {
    parseYamlResult = {
      wordsPerDot: 25,
      calendarView: "annual",
      showWeeklyNote: "yes",
      weekStart: "weekends",
      weeklyNoteFolder: 42,
      madeUpOption: true,
    };

    expect(parseEmbedSettings("not important")).toEqual({
      overrides: { wordsPerDot: 25 },
      diagnostics: [
        "Embed setting calendarView must be month or year.",
        "Embed setting showWeeklyNote must be true or false.",
        "Embed setting weekStart must be locale, sunday, monday, tuesday, wednesday, thursday, friday, or saturday.",
        "Embed setting weeklyNoteFolder must be a string.",
        "Unknown Erin Calendar embed setting: madeUpOption.",
      ],
    });
  });

  it("accepts every supported week-start value and rejects non-finite numbers", () => {
    for (const weekStart of [
      "locale",
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ]) {
      parseYamlResult = { weekStart };
      expect(parseEmbedSettings(weekStart).overrides).toEqual({ weekStart });
    }

    parseYamlResult = { wordsPerDot: Number.NaN };
    expect(parseEmbedSettings("wordsPerDot: .nan")).toEqual({
      overrides: {},
      diagnostics: ["Embed setting wordsPerDot must be a finite number."],
    });
  });

  it("treats empty blocks as valid and malformed YAML as non-fatal", () => {
    expect(parseEmbedSettings("   \n")).toEqual({
      overrides: {},
      diagnostics: [],
    });
    expect(mockParseYaml).not.toHaveBeenCalled();

    mockParseYaml.mockImplementation(() => {
      throw new Error("bad YAML");
    });
    expect(parseEmbedSettings("weekStart: [")).toEqual({
      overrides: {},
      diagnostics: ["Could not parse Erin Calendar embed settings: bad YAML"],
    });
  });

  it("treats comments-only YAML as an empty configuration", () => {
    parseYamlResult = null;

    expect(parseEmbedSettings("# Use the sidebar settings here")).toEqual({
      overrides: {},
      diagnostics: [],
    });
  });

  it("rejects a YAML value that is not a mapping", () => {
    parseYamlResult = ["monday"];

    expect(parseEmbedSettings("- monday")).toEqual({
      overrides: {},
      diagnostics: ["Erin Calendar embed settings must be a YAML mapping."],
    });
  });
});

describe("mergeEmbedSettings", () => {
  it("returns an independent settings object with local overrides", () => {
    const globalSettings = settings({ showWeeklyNote: false, wordsPerDot: 50 });
    const merged = mergeEmbedSettings(globalSettings, {
      calendarView: "year",
      showWeeklyNote: true,
      wordsPerDot: 10,
    });

    expect(merged).toEqual(
      settings({ calendarView: "year", showWeeklyNote: true, wordsPerDot: 10 })
    );
    expect(merged).not.toBe(globalSettings);
    expect(globalSettings).toEqual(
      settings({ showWeeklyNote: false, wordsPerDot: 50 })
    );
  });
});
