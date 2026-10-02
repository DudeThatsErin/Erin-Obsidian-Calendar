import type { Moment, unitOfTime } from "moment";
import { normalizePath, Notice } from "obsidian";
import type { TFile } from "obsidian";
import {
  getTemplateInfo,
} from "obsidian-daily-notes-interface";

import type { ISettings } from "src/settings";
import { createConfirmationDialog } from "src/ui/modal";

import { getNoteLeaf } from "./workspace";
import {
  formatWeeklyNoteDate,
  resolveWeeklyNoteSettings,
  type WeeklyNoteSettingsInput,
  withWeeklyMomentLocale,
} from "./weeklyNoteSettings";

const templateDateUnits: Record<string, unitOfTime.DurationConstructor> = {
  y: "y",
  q: "Q",
  m: "m",
  w: "w",
  d: "d",
  h: "h",
  s: "s",
};

function joinPaths(...partSegments: string[]): string {
  let parts: string[] = [];

  partSegments.forEach((part) => {
    parts = parts.concat(part.split("/"));
  });

  const normalizedParts: string[] = [];
  parts.forEach((part) => {
    if (part && part !== ".") {
      normalizedParts.push(part);
    }
  });

  if (parts[0] === "") {
    normalizedParts.unshift("");
  }

  return normalizedParts.join("/");
}

async function getWeeklyNotePath(
  directory: string,
  filename: string
): Promise<string> {
  const markdownFilename = filename.endsWith(".md")
    ? filename
    : `${filename}.md`;
  const path = normalizePath(joinPaths(directory, markdownFilename));
  const folder = path.replace(/\\/g, "/").split("/").slice(0, -1);

  if (folder.length) {
    const folderPath = joinPaths(...folder);
    if (!window.app.vault.getAbstractFileByPath(folderPath)) {
      await window.app.vault.createFolder(folderPath);
    }
  }

  return path;
}

function getDaysOfWeek(date: Moment): string[] {
  let weekStart = date.localeData().firstDayOfWeek();
  const daysOfWeek = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];

  while (weekStart) {
    daysOfWeek.push(daysOfWeek.shift() as string);
    weekStart -= 1;
  }

  return daysOfWeek;
}

/** Expand the same date, title, time, and weekday tokens as Weekly Notes. */
export function expandWeeklyNoteTemplate(
  templateContents: string,
  date: Moment,
  format: string,
  now: Moment = window.moment(),
  settings?: WeeklyNoteSettingsInput
): string {
  const weeklyDate = withWeeklyMomentLocale(date, settings);
  const filename = formatWeeklyNoteDate(weeklyDate, format, settings);

  return templateContents
    .replace(/{{\s*date\s*}}/gi, formatWeeklyNoteDate(weeklyDate, format, settings))
    .replace(/{{\s*time\s*}}/gi, now.format("HH:mm"))
    .replace(/{{\s*title\s*}}/gi, filename)
    .replace(
      /{{\s*(date|time)\s*(([+-]\d+)([yqmwdhs]))?\s*(:.+?)?}}/gi,
      (
        _match,
        _timeOrDate,
        calc: string,
        timeDelta: string,
        unit: string,
        momentFormat: string
      ) => {
        const targetDate = weeklyDate.clone().set({
          hour: now.get("hour"),
          minute: now.get("minute"),
          second: now.get("second"),
        });

        if (calc) {
          targetDate.add(
            parseInt(timeDelta, 10),
            templateDateUnits[unit.toLowerCase()]
          );
        }
        if (momentFormat) {
          return formatWeeklyNoteDate(
            targetDate,
            momentFormat.substring(1).trim(),
            settings
          );
        }
        return formatWeeklyNoteDate(targetDate, format, settings);
      }
    )
    .replace(
      /{{\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s*:(.*?)}}/gi,
      (_match, dayOfWeek: string, momentFormat: string) => {
        const day = getDaysOfWeek(weeklyDate).indexOf(
          dayOfWeek.toLowerCase()
        );
        return weeklyDate.clone().weekday(day).format(momentFormat.trim());
      }
    );
}

/**
 * Create a Weekly Note with the supplied Calendar settings. Empty Calendar
 * values inherit their corresponding setting from Calendar or Periodic Notes.
 */
export async function createCalendarWeeklyNote(
  date: Moment,
  settings?: WeeklyNoteSettingsInput
): Promise<TFile | null> {
  const { folder, format, template } = resolveWeeklyNoteSettings(settings);
  const weeklyDate = withWeeklyMomentLocale(date, settings);
  const filename = formatWeeklyNoteDate(weeklyDate, format, settings);
  let path = filename;

  try {
    const [templateContents, foldInfo] = await getTemplateInfo(template);
    path = await getWeeklyNotePath(folder, filename);
    const createdFile = await window.app.vault.create(
      path,
      expandWeeklyNoteTemplate(templateContents, weeklyDate, format, undefined, settings)
    );

    const foldManager = (window.app as unknown as {
      foldManager?: { save: (file: TFile, info: unknown) => void };
    }).foldManager;
    foldManager?.save(createdFile, foldInfo);
    return createdFile;
  } catch (err) {
    console.error(`Failed to create file: '${path}'`, err);
    new Notice("Unable to create new file.");
    return null;
  }
}

/**
 * Create a Weekly Note for a given date.
 */
export async function tryToCreateWeeklyNote(
  date: Moment,
  inNewSplit: boolean,
  settings: ISettings,
  cb?: (file: TFile) => void
): Promise<void> {
  const { format } = resolveWeeklyNoteSettings(settings);
  const filename = formatWeeklyNoteDate(date, format, settings);

  const createFile = async () => {
    const dailyNote = await createCalendarWeeklyNote(date, settings);
    if (!dailyNote) {
      return;
    }
    const leaf = getNoteLeaf(inNewSplit);

    await leaf.openFile(dailyNote, { active : true });
    cb?.(dailyNote);
  };

  if (settings.shouldConfirmBeforeCreate) {
    createConfirmationDialog({
      cta: "Create",
      onAccept: createFile,
      text: `File ${filename} does not exist. Would you like to create it?`,
      title: "New Weekly Note",
    });
  } else {
    await createFile();
  }
}
