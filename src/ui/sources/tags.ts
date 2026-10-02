import type { Moment } from "moment";
import { parseFrontMatterTags } from "obsidian";
import type { TFile } from "obsidian";
import type { ICalendarSource, IDayMetadata } from "obsidian-calendar-ui";
import type { Readable } from "svelte/store";
import { get } from "svelte/store";

import { getDailyNotesForDate } from "src/io/dailyNotesIndex";
import { getWeeklyNoteForDate } from "src/io/weeklyNotesIndex";
import { partition } from "src/ui/utils";
import type { DailyNotesIndex } from "src/io/dailyNotesIndex";
import type { WeeklyNotesIndex } from "src/io/weeklyNotesIndex";
import type { ISettings } from "src/settings";

import { dailyNotes, settings, weeklyNotes } from "../stores";

function getNoteTags(note: TFile | null): string[] {
  if (!note) {
    return [];
  }

  const { metadataCache } = window.app;
  const frontmatter = metadataCache.getFileCache(note)?.frontmatter;

  const tags = [];

  if (frontmatter) {
    const frontmatterTags = parseFrontMatterTags(frontmatter) || [];
    tags.push(...frontmatterTags);
  }

  // strip the '#' at the beginning
  return tags.map((tag) => tag.substring(1));
}

function getFormattedTagAttributes(notes: TFile[]): Record<string, string> {
  const attrs: Record<string, string> = {};
  const tags = Array.from(
    new Set(
      notes.reduce<string[]>(
        (allTags, note) => allTags.concat(getNoteTags(note)),
        []
      )
    )
  );

  const [emojiTags, nonEmojiTags] = partition(tags, (tag) =>
    /(?:[\u2700-\u27bf]|(?:\ud83c[\udde6-\uddff]){2}|[\ud800-\udbff][\udc00-\udfff]|[\u0023-\u0039]\ufe0f?\u20e3|\u3299|\u3297|\u303d|\u3030|\u24c2|\ud83c[\udd70-\udd71]|\ud83c[\udd7e-\udd7f]|\ud83c\udd8e|\ud83c[\udd91-\udd9a]|\ud83c[\udde6-\uddff]|\ud83c[\ude01-\ude02]|\ud83c\ude1a|\ud83c\ude2f|\ud83c[\ude32-\ude3a]|\ud83c[\ude50-\ude51]|\u203c|\u2049|[\u25aa-\u25ab]|\u25b6|\u25c0|[\u25fb-\u25fe]|\u00a9|\u00ae|\u2122|\u2139|\ud83c\udc04|[\u2600-\u26FF]|\u2b05|\u2b06|\u2b07|\u2b1b|\u2b1c|\u2b50|\u2b55|\u231a|\u231b|\u2328|\u23cf|[\u23e9-\u23f3]|[\u23f8-\u23fa]|\ud83c\udccf|\u2934|\u2935|[\u2190-\u21ff])/.test(
      tag
    )
  );

  if (nonEmojiTags) {
    attrs["data-tags"] = nonEmojiTags.join(" ");
  }
  if (emojiTags) {
    attrs["data-emoji-tag"] = emojiTags[0];
  }

  return attrs;
}

export function createCustomTagsSource(
  dailyNotesStore: Readable<DailyNotesIndex>,
  weeklyNotesStore: Readable<WeeklyNotesIndex>,
  settingsStore: Readable<ISettings>
): ICalendarSource {
  return {
    getDailyMetadata: async (date: Moment): Promise<IDayMetadata> => {
      const files = getDailyNotesForDate(date, get(dailyNotesStore));
      return {
        dataAttributes: getFormattedTagAttributes(files),
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
        dataAttributes: getFormattedTagAttributes(file ? [file] : []),
        dots: [],
      };
    },
  };
}

export const customTagsSource = createCustomTagsSource(
  dailyNotes,
  weeklyNotes,
  settings
);
