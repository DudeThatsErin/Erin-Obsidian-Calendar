import type { Moment } from "moment";
import type { TFile } from "obsidian";
import { getDateUID } from "obsidian-daily-notes-interface";
import type { Readable, Writable } from "svelte/store";
import { get, writable } from "svelte/store";

import { defaultSettings, ISettings } from "src/settings";
import { resolveCalendarLocale } from "src/ui/isolatedCalendar/locale";

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

/** A writable store whose contents can be refreshed from the vault. */
export interface ReindexableStore<T> extends Writable<T> {
  reindex: () => void;
}

function getDailyNoteIndexOptions(options: ISettings): DailyNoteIndexOptions {
  return {
    locale: resolveCalendarLocale(options.localeOverride),
    metadataDateFormat: options.metadataDateFormat,
    metadataDateProperty: options.metadataDateProperty,
    useMetadataDates: options.useMetadataDates,
  };
}

export function createDailyNotesStore(
  settingsStore: Readable<ISettings> = settings
): ReindexableStore<DailyNotesIndex> {
  let hasError = false;
  const store = writable<DailyNotesIndex>(null);
  return {
    reindex: () => {
      try {
        const dailyNotes = getAllDailyNotesIndex(
          getDailyNoteIndexOptions(get(settingsStore))
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

export function createWeeklyNotesStore(
  settingsStore: Readable<ISettings> = settings
): ReindexableStore<WeeklyNotesIndex> {
  let hasError = false;
  const store = writable<WeeklyNotesIndex>(null);
  return {
    reindex: () => {
      try {
        const weeklyNotes = getAllWeeklyNotesIndex(get(settingsStore));
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

export interface DateTagsStore extends Writable<IndexedDateTags> {
  reindex: (enabled: boolean) => Promise<void>;
}

export function createDateTagsStore(): DateTagsStore {
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

export interface SelectedFileStore extends Writable<string | null> {
  setFile: (file: TFile | null, selectedDailyDate?: Moment) => void;
}

export interface CalendarSelection {
  activeDailyDate: Writable<Moment | null>;
  activeFile: SelectedFileStore;
}

export function createSelectedFileStore(
  settingsStore: Readable<ISettings> = settings,
  activeDailyDateStore: Writable<Moment | null> = activeDailyDate
): SelectedFileStore {
  const store = writable<string | null>(null);

  return {
    setFile: (file: TFile | null, selectedDailyDate?: Moment) => {
      const dailyDate =
        selectedDailyDate ||
        (file
          ? getDateFromCalendarDailyNote(
              file,
              getDailyNoteIndexOptions(get(settingsStore))
            )
          : null);

      activeDailyDateStore.set(
        dailyDate ? dailyDate.clone().startOf("day") : null
      );
      store.set(
        dailyDate
          ? getDateUID(dailyDate, "day")
          : getDateUIDFromFile(
              file,
              getDailyNoteIndexOptions(get(settingsStore)),
              get(settingsStore)
            )
      );
    },
    ...store,
  };
}

export const activeFile = createSelectedFileStore();

/** Build selection stores that belong to one embedded calendar. */
export function createCalendarSelection(
  settingsStore: Readable<ISettings>
): CalendarSelection {
  const activeDailyDate = writable<Moment | null>(null);
  return {
    activeDailyDate,
    activeFile: createSelectedFileStore(settingsStore, activeDailyDate),
  };
}
