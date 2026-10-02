import type { Moment } from "moment";
import type { TFile } from "obsidian";
import type { ICalendarSource, IDayMetadata, IDot } from "obsidian-calendar-ui";
import type { Readable } from "svelte/store";
import { get } from "svelte/store";

import { getDailyNotesForDate } from "src/io/dailyNotesIndex";
import { getWeeklyNoteForDate } from "src/io/weeklyNotesIndex";
import type { DailyNotesIndex } from "src/io/dailyNotesIndex";
import type { WeeklyNotesIndex } from "src/io/weeklyNotesIndex";
import type { ISettings } from "src/settings";

import { dailyNotes, settings, weeklyNotes } from "../stores";

export async function getNumberOfRemainingTasks(note: TFile): Promise<number> {
  if (!note) {
    return 0;
  }

  const { vault } = window.app;
  const fileContents = await vault.cachedRead(note);
  return (fileContents.match(/(-|\*) \[ \]/g) || []).length;
}

export async function getDotsForDailyNote(
  dailyNote: TFile | null
): Promise<IDot[]> {
  if (!dailyNote) {
    return [];
  }
  const numTasks = await getNumberOfRemainingTasks(dailyNote);

  const dots = [];
  if (numTasks) {
    dots.push({
      className: "task",
      color: "default",
      isFilled: false,
    });
  }
  return dots;
}

async function getDotsForNotes(notes: TFile[]): Promise<IDot[]> {
  const taskCounts = await Promise.all(notes.map(getNumberOfRemainingTasks));
  if (!taskCounts.some((count) => count > 0)) {
    return [];
  }

  return [
    {
      className: "task",
      color: "default",
      isFilled: false,
    },
  ];
}

export function createTasksSource(
  dailyNotesStore: Readable<DailyNotesIndex>,
  weeklyNotesStore: Readable<WeeklyNotesIndex>,
  settingsStore: Readable<ISettings>
): ICalendarSource {
  return {
    getDailyMetadata: async (date: Moment): Promise<IDayMetadata> => {
      const dots = await getDotsForNotes(
        getDailyNotesForDate(date, get(dailyNotesStore))
      );
      return { dots };
    },

    getWeeklyMetadata: async (date: Moment): Promise<IDayMetadata> => {
      const file = getWeeklyNoteForDate(
        date,
        get(weeklyNotesStore),
        get(settingsStore)
      );
      const dots = await getDotsForDailyNote(file);
      return { dots };
    },
  };
}

export const tasksSource = createTasksSource(dailyNotes, weeklyNotes, settings);
