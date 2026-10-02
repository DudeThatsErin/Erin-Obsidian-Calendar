import type { Moment } from "moment";
import { getAllTags } from "obsidian";
import type { TFile } from "obsidian";
import { getDateUID } from "obsidian-daily-notes-interface";

export interface DateTagEntry {
  date: Moment;
  description: string;
  file: TFile;
}

export interface DateTagIndex {
  entriesByDate: Record<string, DateTagEntry[]>;
}

const dateTagPattern = /^#?(\d{4}-\d{2}-\d{2})$/;

function dateFromTag(tag: string): Moment | null {
  const match = dateTagPattern.exec(tag);
  if (!match) {
    return null;
  }

  const date = window.moment(match[1], "YYYY-MM-DD", true);
  return date.isValid() ? date : null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Extract a concise event/task summary below a date tag. If a note only uses
 * frontmatter or has no list beneath the tag, its file name remains useful.
 */
function describeDateTag(contents: string, tag: string, fallback: string): string {
  const tagExpression = new RegExp(
    `(?:^|\\s)${escapeRegExp(tag)}(?![A-Za-z0-9_/-])`
  );
  const lines = contents.split(/\r?\n/);
  const start = lines.findIndex((line) => tagExpression.test(line));
  if (start === -1) {
    return fallback;
  }

  const descriptions: string[] = [];
  for (let lineIndex = start + 1; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (/^#{1,6}\s/.test(line) || dateTagPattern.test(line.trim())) {
      break;
    }

    const task = /^\s*(?:[-*+]\s+)(?:\[[ xX]\]\s*)?(.*\S)\s*$/.exec(line);
    if (task) {
      descriptions.push(task[1]);
    }
    if (descriptions.length === 3) {
      break;
    }
  }

  return descriptions.length ? descriptions.join(" · ") : fallback;
}

/**
 * Index exact ISO date tags (`#YYYY-MM-DD`) across the vault once, rather than
 * scanning every note for every calendar cell.
 */
export async function getAllDateTags(): Promise<DateTagIndex> {
  const entriesByDate: Record<string, DateTagEntry[]> = {};
  const { metadataCache, vault } = window.app;

  for (const file of vault.getMarkdownFiles()) {
    const cache = metadataCache.getFileCache(file);
    if (!cache) {
      continue;
    }
    const tags = getAllTags(cache) || [];
    const dates = tags
      .map((tag) => ({ date: dateFromTag(tag), tag }))
      .filter(
        (entry): entry is { date: Moment; tag: string } => entry.date !== null
      );
    if (!dates.length) {
      continue;
    }

    const contents = await vault.cachedRead(file);
    const seenIds = new Set<string>();
    for (const { date, tag } of dates) {
      const id = getDateUID(date, "day");
      if (seenIds.has(id)) {
        continue;
      }
      seenIds.add(id);

      const entries = entriesByDate[id] || [];
      entries.push({
        date,
        description: describeDateTag(contents, tag, file.basename),
        file,
      });
      entriesByDate[id] = entries;
    }
  }

  return { entriesByDate };
}

export function getDateTagEntries(
  date: Moment,
  index: DateTagIndex | null
): DateTagEntry[] {
  return index?.entriesByDate[getDateUID(date, "day")] || [];
}
