import type { ISettings } from "src/settings";

export function getDefaultSettings(
  overrides: Partial<ISettings> = {}
): ISettings {
  return Object.assign(
    {},
    {
      weekStart: "sunday",
      shouldConfirmBeforeCreate: false,
      wordsPerDot: 50,
      weekdayLabelFormat: "ddd",
      showMonthlyNote: false,
      showQuarterlyNote: false,
      showYearlyNote: false,
      showWeeklyNote: false,
      weeklyNoteFolder: "",
      weeklyNoteFormat: "",
      weeklyNoteTemplate: "",
      showDateTags: true,
      useMetadataDates: false,
      metadataDateProperty: "date",
      metadataDateFormat: "YYYY-MM-DD",
      localeOverride: "system-default",
    },
    overrides
  );
}
