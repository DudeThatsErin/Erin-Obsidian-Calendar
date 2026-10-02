import type { Moment, unitOfTime } from "moment";
import { normalizePath, Notice } from "obsidian";
import type { TFile } from "obsidian";
import {
  getDailyNoteSettings,
  getTemplateInfo,
} from "obsidian-daily-notes-interface";

import type { ISettings } from "src/settings";
import { createConfirmationDialog } from "src/ui/modal";

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

async function getNotePath(directory: string, filename: string): Promise<string> {
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

/**
 * Expand Daily Notes template tokens for a note created from Calendar.
 *
 * The core Daily Notes command uses the current date for a bare {{date}}
 * token. Preserve that behavior here while keeping the selected calendar date
 * for the filename, title, and date-aware tokens.
 */
export function expandDailyNoteTemplate(
  templateContents: string,
  date: Moment,
  format: string,
  now: Moment = window.moment()
): string {
  const filename = date.format(format);

  return templateContents
    .replace(/{{\s*date\s*}}/gi, now.format(format))
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
        const targetDate = date.clone().set({
          hour: now.get("hour"),
          minute: now.get("minute"),
          second: now.get("second"),
        });

        if (calc) {
          targetDate.add(parseInt(timeDelta, 10), templateDateUnits[unit]);
        }
        if (momentFormat) {
          return targetDate.format(momentFormat.substring(1).trim());
        }
        return targetDate.format(format);
      }
    )
    .replace(/{{\s*yesterday\s*}}/gi, date.clone().subtract(1, "day").format(format))
    .replace(/{{\s*tomorrow\s*}}/gi, date.clone().add(1, "day").format(format));
}

/**
 * Create a daily note using the configured Daily Notes settings.
 *
 * This mirrors the interface package's creator except for bare {{date}},
 * which intentionally resolves to the date on which the note is created.
 */
export async function createCalendarDailyNote(date: Moment): Promise<TFile | null> {
  const app = window.app;
  const { vault } = app;
  const { template, format, folder } = getDailyNoteSettings();
  const filename = date.format(format);
  const [templateContents, foldInfo] = await getTemplateInfo(template);
  const path = await getNotePath(folder, filename);

  try {
    const createdFile = await vault.create(
      path,
      expandDailyNoteTemplate(templateContents, date, format)
    );

    const foldManager = (app as unknown as {
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
 * Create a Daily Note for a given date.
 */
export async function tryToCreateDailyNote(
  date: Moment,
  inNewSplit: boolean,
  settings: ISettings,
  cb?: (newFile: TFile) => void
): Promise<void> {
  const { workspace } = window.app;
  const { format } = getDailyNoteSettings();
  const filename = date.format(format);

  const createFile = async () => {
    const dailyNote = await createCalendarDailyNote(date);
    if (!dailyNote) {
      return;
    }
    const leaf = inNewSplit
      ? workspace.splitActiveLeaf()
      : workspace.getUnpinnedLeaf();

    await leaf.openFile(dailyNote, { active : true });
    cb?.(dailyNote);
  };

  if (settings.shouldConfirmBeforeCreate) {
    createConfirmationDialog({
      cta: "Create",
      onAccept: createFile,
      text: `File ${filename} does not exist. Would you like to create it?`,
      title: "New Daily Note",
    });
  } else {
    await createFile();
  }
}
