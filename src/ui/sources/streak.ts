import type { Moment } from "moment";
import type { TFile } from "obsidian";
import type { ICalendarSource, IDayMetadata } from "obsidian-calendar-ui";
import { get } from "svelte/store";

import { getDailyNotesForDate } from "src/io/dailyNotesIndex";
import { getWeeklyNoteForDate } from "src/io/weeklyNotesIndex";

import { dailyNotes, weeklyNotes } from "../stores";
import { classList } from "../utils";

const getStreakClasses = (files: TFile[]): string[] => {
  return classList({
    "has-note": files.length > 0,
  });
};

export const streakSource: ICalendarSource = {
  getDailyMetadata: async (date: Moment): Promise<IDayMetadata> => {
    const files = getDailyNotesForDate(date, get(dailyNotes));
    return {
      classes: getStreakClasses(files),
      dots: [],
    };
  },

  getWeeklyMetadata: async (date: Moment): Promise<IDayMetadata> => {
    const file = getWeeklyNoteForDate(date, get(weeklyNotes));
    return {
      classes: getStreakClasses(file ? [file] : []),
      dots: [],
    };
  },
};
