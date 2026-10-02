import type { Moment } from "moment";
import { TFile } from "obsidian";
import {
  createPeriodicNote,
  getPeriodicNoteSettings,
} from "obsidian-daily-notes-interface";

import type { ISettings } from "src/settings";
import { createConfirmationDialog } from "src/ui/modal";

import { getConfiguredNotePath } from "./notePaths";
import { getNoteLeaf } from "./workspace";

export type HeaderNoteGranularity = "month" | "quarter" | "year";

const headerNoteLabels: Record<HeaderNoteGranularity, string> = {
  month: "Monthly",
  quarter: "Quarterly",
  year: "Yearly",
};

export function getExistingPeriodicNote(
  granularity: HeaderNoteGranularity,
  date: Moment
): TFile | null {
  const path = getConfiguredNotePath(
    date,
    getPeriodicNoteSettings(granularity)
  );
  if (!path) {
    return null;
  }

  const file = window.app.vault.getAbstractFileByPath(path);
  return file instanceof TFile ? file : null;
}

export async function tryToCreatePeriodicNote(
  granularity: HeaderNoteGranularity,
  date: Moment,
  inNewTab: boolean,
  settings: ISettings,
  cb?: (file: TFile) => void
): Promise<void> {
  const noteSettings = getPeriodicNoteSettings(granularity);
  const filename = date.format(noteSettings.format);
  const label = headerNoteLabels[granularity];

  const createFile = async () => {
    const note = await createPeriodicNote(granularity, date);
    if (!note) {
      return;
    }

    const leaf = getNoteLeaf(inNewTab);
    await leaf.openFile(note, { active: true });
    cb?.(note);
  };

  if (settings.shouldConfirmBeforeCreate) {
    createConfirmationDialog({
      cta: "Create",
      onAccept: createFile,
      text: `File ${filename} does not exist. Would you like to create it?`,
      title: `New ${label} Note`,
    });
  } else {
    await createFile();
  }
}
