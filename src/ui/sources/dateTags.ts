import type { Moment } from "moment";
import type { ICalendarSource, IDayMetadata } from "obsidian-calendar-ui";
import type { Readable } from "svelte/store";
import { get } from "svelte/store";

import { getDateTagEntries } from "src/io/dateTags";

import type { IndexedDateTags } from "../stores";
import { dateTags } from "../stores";

/** Surface exact #YYYY-MM-DD tags as a calendar dot and native hover title. */
export function createDateTagsSource(
  dateTagsStore: Readable<IndexedDateTags>
): ICalendarSource {
  const dateTagTitle = (date: Moment): string =>
    getDateTagEntries(date, get(dateTagsStore))
      .map((entry) => `${entry.description} (${entry.file.path})`)
      .join("\n");

  return {
    getDailyMetadata: async (date: Moment): Promise<IDayMetadata> => {
      const title = dateTagTitle(date);
      return title
        ? {
            classes: ["has-date-tag"],
            dataAttributes: { title },
            dots: [
              {
                className: "date-tag",
                color: "default",
                isFilled: false,
              },
            ],
          }
        : { dots: [] };
    },
    getWeeklyMetadata: async (): Promise<IDayMetadata> => ({ dots: [] }),
  };
}

export const dateTagsSource = createDateTagsSource(dateTags);
