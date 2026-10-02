import type { Moment } from "moment";
import type { TFile } from "obsidian";
import type { ICalendarSource, IDayMetadata, IDot } from "obsidian-calendar-ui";
import { get } from "svelte/store";

import { DEFAULT_WORDS_PER_DOT } from "src/constants";
import { getDailyNotesForDate } from "src/io/dailyNotesIndex";
import { getWeeklyNoteForDate } from "src/io/weeklyNotesIndex";

import { dailyNotes, settings, weeklyNotes } from "../stores";
import { clamp, getWordCount } from "../utils";

const NUM_MAX_DOTS = 5;

export async function getWordLengthAsDots(note: TFile): Promise<number> {
  const { wordsPerDot = DEFAULT_WORDS_PER_DOT } = get(settings);
  if (!note || wordsPerDot <= 0) {
    return 0;
  }
  const fileContents = await window.app.vault.cachedRead(note);

  const wordCount = getWordCount(fileContents);
  const numDots = wordCount / wordsPerDot;
  return clamp(Math.floor(numDots), 1, NUM_MAX_DOTS);
}

export async function getDotsForDailyNote(
  dailyNote: TFile | null
): Promise<IDot[]> {
  if (!dailyNote) {
    return [];
  }
  const numSolidDots = await getWordLengthAsDots(dailyNote);

  const dots = [];
  for (let i = 0; i < numSolidDots; i++) {
    dots.push({
      color: "default",
      isFilled: true,
    });
  }
  return dots;
}

async function getDotsForNotes(notes: TFile[]): Promise<IDot[]> {
  if (!notes.length) {
    return [];
  }

  const wordCounts = await Promise.all(notes.map(getWordLengthAsDots));
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

export const wordCountSource: ICalendarSource = {
  getDailyMetadata: async (date: Moment): Promise<IDayMetadata> => {
    const dots = await getDotsForNotes(
      getDailyNotesForDate(date, get(dailyNotes))
    );
    return {
      dots,
    };
  },

  getWeeklyMetadata: async (date: Moment): Promise<IDayMetadata> => {
    const file = getWeeklyNoteForDate(date, get(weeklyNotes));
    const dots = await getDotsForDailyNote(file);

    return {
      dots,
    };
  },
};
