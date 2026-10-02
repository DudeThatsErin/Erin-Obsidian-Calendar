import type { Moment } from "moment";
import type { TFile } from "obsidian";
import { getDateUID } from "obsidian-daily-notes-interface";
import { get, writable } from "svelte/store";

import { defaultSettings, ISettings } from "src/settings";

import { getDateUIDFromFile } from "./utils";
import {
  getAllDailyNotesIndex,
  getDateFromCalendarDailyNote,
} from "../io/dailyNotesIndex";
import type { DailyNoteIndexOptions, DailyNotesIndex } from "../io/dailyNotesIndex";
import { getAllDateTags } from "../io/dateTags";
import type { DateTagIndex } from "../io/dateTags";
import { getAllWeeklyNotesIndex } from "../io/weeklyNotesIndex";
import type { WeeklyNotesIndex } from "../io/weeklyNotesIndex";

export const settings = writable<ISettings>(defaultSettings);

function getDailyNoteIndexOptions(options: ISettings): DailyNoteIndexOptions {
  return {
    metadataDateFormat: options.metadataDateFormat,
    metadataDateProperty: options.metadataDateProperty,
    useMetadataDates: options.useMetadataDates,
  };
}

function createDailyNotesStore() {
  let hasError = false;
  const store = writable<DailyNotesIndex>(null);
  return {
    reindex: () => {
      try {
        const dailyNotes = getAllDailyNotesIndex(
          getDailyNoteIndexOptions(get(settings))
        );
        store.set(dailyNotes);
        hasError = false;
      } catch (err) {
        if (!hasError) {
          // Avoid error being shown multiple times
          console.log("[Calendar] Failed to find daily notes folder", err);
        }
        store.set({ filesByPath: {}, filesByDate: {}, entries: [] });
        hasError = true;
      }
    },
    ...store,
  };
}

function createWeeklyNotesStore() {
  let hasError = false;
  const store = writable<WeeklyNotesIndex>(null);
  return {
    reindex: () => {
      try {
        const weeklyNotes = getAllWeeklyNotesIndex();
        store.set(weeklyNotes);
        hasError = false;
      } catch (err) {
        if (!hasError) {
          // Avoid error being shown multiple times
          console.log("[Calendar] Failed to find weekly notes folder", err);
        }
        store.set({ filesByPath: {}, filesByDate: {} });
        hasError = true;
      }
    },
    ...store,
  };
}

export const dailyNotes = createDailyNotesStore();
export const weeklyNotes = createWeeklyNotesStore();

export interface IndexedDateTags extends DateTagIndex {
  version: number;
}

function createDateTagsStore() {
  const store = writable<IndexedDateTags>({
    entriesByDate: {},
    version: 0,
  });
  let latestRequest = 0;
  let version = 0;

  return {
    reindex: async (enabled: boolean) => {
      const request = ++latestRequest;
      if (!enabled) {
        store.set({ entriesByDate: {}, version: ++version });
        return;
      }

      try {
        const index = await getAllDateTags();
        if (request === latestRequest) {
          store.set({ ...index, version: ++version });
        }
      } catch (err) {
        console.log("[Calendar] Failed to index date tags", err);
        if (request === latestRequest) {
          store.set({ entriesByDate: {}, version: ++version });
        }
      }
    },
    ...store,
  };
}

export const dateTags = createDateTagsStore();
export const activeDailyDate = writable<Moment | null>(null);

function createSelectedFileStore() {
  const store = writable<string>(null);

  return {
    setFile: (file: TFile | null, selectedDailyDate?: Moment) => {
      const dailyDate =
        selectedDailyDate ||
        (file
          ? getDateFromCalendarDailyNote(
              file,
              getDailyNoteIndexOptions(get(settings))
            )
          : null);

      activeDailyDate.set(dailyDate ? dailyDate.clone().startOf("day") : null);
      store.set(
        dailyDate
          ? getDateUID(dailyDate, "day")
          : getDateUIDFromFile(file, getDailyNoteIndexOptions(get(settings)))
      );
    },
    ...store,
  };
}

export const activeFile = createSelectedFileStore();
