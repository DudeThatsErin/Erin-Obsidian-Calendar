import { App, Modal } from "obsidian";
import type { TFile } from "obsidian";

interface IConfirmationDialogParams {
  cta: string;
  // eslint-disable-next-line
  onAccept: (...args: any[]) => Promise<void>;
  text: string;
  title: string;
}

export class ConfirmationModal extends Modal {
  constructor(app: App, config: IConfirmationDialogParams) {
    super(app);

    const { cta, onAccept, text, title } = config;

    this.contentEl.createEl("h2", { text: title });
    this.contentEl.createEl("p", { text });

    this.contentEl.createDiv("modal-button-container", (buttonsEl) => {
      buttonsEl
        .createEl("button", { text: "Never mind" })
        .addEventListener("click", () => this.close());

      buttonsEl
        .createEl("button", {
          cls: "mod-cta",
          text: cta,
        })
        .addEventListener("click", async (e) => {
          await onAccept(e);
          this.close();
        });
    });
  }
}

export function createConfirmationDialog({
  cta,
  onAccept,
  text,
  title,
}: IConfirmationDialogParams): void {
  new ConfirmationModal(window.app, { cta, onAccept, text, title }).open();
}

interface IFilePickerParams {
  files: TFile[];
  onChoose: (file: TFile) => Promise<void>;
  text: string;
  title: string;
}

class FilePickerModal extends Modal {
  constructor(app: App, config: IFilePickerParams) {
    super(app);

    this.contentEl.createEl("h2", { text: config.title });
    this.contentEl.createEl("p", { text: config.text });
    const filesEl = this.contentEl.createDiv("erin-calendar-file-picker");

    config.files.forEach((file) => {
      filesEl
        .createEl("button", { text: file.path })
        .addEventListener("click", async () => {
          await config.onChoose(file);
          this.close();
        });
    });
  }
}

/** Let the user choose when multiple imported notes map to one calendar day. */
export function showFilePicker(config: IFilePickerParams): void {
  new FilePickerModal(window.app, config).open();
}
