import type { Moment } from "moment";
import type { TFile } from "obsidian";
import type { ICalendarSource, IDayMetadata, IDot } from "obsidian-calendar-ui";
import type { Readable } from "svelte/store";
import { get } from "svelte/store";

import { DEFAULT_WORDS_PER_DOT } from "src/constants";
import { getDailyNotesForDate } from "src/io/dailyNotesIndex";
import { getWeeklyNoteForDate } from "src/io/weeklyNotesIndex";
import type { ISettings } from "src/settings";

import type { DailyNotesIndex } from "src/io/dailyNotesIndex";
import type { WeeklyNotesIndex } from "src/io/weeklyNotesIndex";
import { dailyNotes, settings, weeklyNotes } from "../stores";
import { clamp, getWordCount } from "../utils";

const NUM_MAX_DOTS = 5;

export async function getWordLengthAsDots(
  note: TFile,
  settingsStore: Readable<ISettings> = settings
): Promise<number> {
  const { wordsPerDot = DEFAULT_WORDS_PER_DOT } = get(settingsStore);
  if (!note || wordsPerDot <= 0) {
    return 0;
  }
  const fileContents = await window.app.vault.cachedRead(note);

  const wordCount = getWordCount(fileContents);
  const numDots = wordCount / wordsPerDot;
  return clamp(Math.floor(numDots), 1, NUM_MAX_DOTS);
}

export async function getDotsForDailyNote(
  dailyNote: TFile | null,
  settingsStore: Readable<ISettings> = settings
): Promise<IDot[]> {
  if (!dailyNote) {
    return [];
  }
  const numSolidDots = await getWordLengthAsDots(dailyNote, settingsStore);

  const dots = [];
  for (let i = 0; i < numSolidDots; i++) {
    dots.push({
      color: "default",
      isFilled: true,
    });
  }
  return dots;
}

async function getDotsForNotes(
  notes: TFile[],
  settingsStore: Readable<ISettings> = settings
): Promise<IDot[]> {
  if (!notes.length) {
    return [];
  }

  const wordCounts = await Promise.all(
    notes.map((note) => getWordLengthAsDots(note, settingsStore))
  );
  const numSolidDots = clamp(
    wordCounts.reduce((total, count) => total + count, 0),
    0,
    NUM_MAX_DOTS
  );
  return Array.from({ length: numSolidDots }, () => ({
    className: "",
    color: "default",
    isFilled: true,
  }));
}

export function createWordCountSource(
  dailyNotesStore: Readable<DailyNotesIndex>,
  weeklyNotesStore: Readable<WeeklyNotesIndex>,
  settingsStore: Readable<ISettings>
): ICalendarSource {
  return {
    getDailyMetadata: async (date: Moment): Promise<IDayMetadata> => {
      const dots = await getDotsForNotes(
        getDailyNotesForDate(date, get(dailyNotesStore)),
        settingsStore
      );
      return { dots };
    },

    getWeeklyMetadata: async (date: Moment): Promise<IDayMetadata> => {
      const file = getWeeklyNoteForDate(
        date,
        get(weeklyNotesStore),
        get(settingsStore)
      );
      const dots = await getDotsForDailyNote(file, settingsStore);
      return { dots };
    },
  };
}

export const wordCountSource = createWordCountSource(
  dailyNotes,
  weeklyNotes,
  settings
);
