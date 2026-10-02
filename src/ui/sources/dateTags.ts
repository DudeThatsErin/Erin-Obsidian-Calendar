import type { Moment } from "moment";
import type { ICalendarSource, IDayMetadata } from "obsidian-calendar-ui";
import { get } from "svelte/store";

import { getDateTagEntries } from "src/io/dateTags";

import { dateTags } from "../stores";

function dateTagTitle(date: Moment): string {
  return getDateTagEntries(date, get(dateTags))
    .map((entry) => `${entry.description} (${entry.file.path})`)
    .join("\n");
}

/** Surface exact #YYYY-MM-DD tags as a calendar dot and native hover title. */
export const dateTagsSource: ICalendarSource = {
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
