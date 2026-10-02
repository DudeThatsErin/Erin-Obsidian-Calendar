import type { Moment } from "moment";
import type { TFile } from "obsidian";
import type { ICalendarSource, IDayMetadata } from "obsidian-calendar-ui";
import type { Readable } from "svelte/store";
import { get } from "svelte/store";

import { getDailyNotesForDate } from "src/io/dailyNotesIndex";
import { getWeeklyNoteForDate } from "src/io/weeklyNotesIndex";
import type { DailyNotesIndex } from "src/io/dailyNotesIndex";
import type { WeeklyNotesIndex } from "src/io/weeklyNotesIndex";
import type { ISettings } from "src/settings";

import { dailyNotes, settings, weeklyNotes } from "../stores";
import { classList } from "../utils";

const getStreakClasses = (files: TFile[]): string[] => {
  return classList({
    "has-note": files.length > 0,
  });
};

export function createStreakSource(
  dailyNotesStore: Readable<DailyNotesIndex>,
  weeklyNotesStore: Readable<WeeklyNotesIndex>,
  settingsStore: Readable<ISettings>
): ICalendarSource {
  return {
    getDailyMetadata: async (date: Moment): Promise<IDayMetadata> => {
      const files = getDailyNotesForDate(date, get(dailyNotesStore));
      return {
        classes: getStreakClasses(files),
        dots: [],
      };
    },

    getWeeklyMetadata: async (date: Moment): Promise<IDayMetadata> => {
      const file = getWeeklyNoteForDate(
        date,
        get(weeklyNotesStore),
        get(settingsStore)
      );
      return {
        classes: getStreakClasses(file ? [file] : []),
        dots: [],
      };
    },
  };
}

export const streakSource = createStreakSource(dailyNotes, weeklyNotes, settings);
