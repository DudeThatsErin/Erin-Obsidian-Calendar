import type { Moment } from "moment";
import { FileView, ItemView, Menu, Notice } from "obsidian";
import type { HoverPopover, TFile, WorkspaceLeaf } from "obsidian";
import {
  getDailyNoteSettings,
  getWeeklyNoteSettings,
} from "obsidian-daily-notes-interface";
import { get } from "svelte/store";

import { TRIGGER_ON_OPEN, VIEW_TYPE_CALENDAR } from "src/constants";
import {
  getDateFromCalendarDailyNote,
  getDailyNoteForDate,
  getDailyNotesForDate,
} from "src/io/dailyNotesIndex";
import type { DailyNoteIndexOptions } from "src/io/dailyNotesIndex";
import {
  getExistingPeriodicNote,
  tryToCreatePeriodicNote,
} from "src/io/periodicNotes";
import type { HeaderNoteGranularity } from "src/io/periodicNotes";
import { tryToCreateDailyNote } from "src/io/dailyNotes";
import { tryToCreateWeeklyNote } from "src/io/weeklyNotes";
import { getDateFromWeeklyNoteFile, getWeeklyNoteForDate } from "src/io/weeklyNotesIndex";
import { getNoteLeaf } from "src/io/workspace";
import {
  appHasPeriodicNotesPluginLoaded,
} from "src/settings";
import type { ISettings, PeriodicNotesInterval } from "src/settings";

import Calendar from "./ui/Calendar.svelte";
import { showFileMenu } from "./ui/fileMenu";
import { showFilePicker } from "./ui/modal";
import {
  activeFile,
  dailyNotes,
  dateTags,
  settings,
  weeklyNotes,
} from "./ui/stores";
import {
  customTagsSource,
  dateTagsSource,
  streakSource,
  tasksSource,
  wordCountSource,
} from "./ui/sources";
import { getDateTagEntries } from "./io/dateTags";

const periodicIntervalForHeader: Record<
  HeaderNoteGranularity,
  PeriodicNotesInterval
> = {
  month: "monthly",
  quarter: "quarterly",
  year: "yearly",
};

export default class CalendarView extends ItemView {
  private calendar: Calendar;
  private settings: ISettings;
  private hoverPopover: HoverPopover | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);

    this.openOrCreateDailyNote = this.openOrCreateDailyNote.bind(this);
    this.openOrCreateWeeklyNote = this.openOrCreateWeeklyNote.bind(this);
    this.openOrCreatePeriodicNote = this.openOrCreatePeriodicNote.bind(this);

    this.onNoteSettingsUpdate = this.onNoteSettingsUpdate.bind(this);
    this.onFileCreated = this.onFileCreated.bind(this);
    this.onFileDeleted = this.onFileDeleted.bind(this);
    this.onFileModified = this.onFileModified.bind(this);
    this.onFileRenamed = this.onFileRenamed.bind(this);
    this.onFileOpen = this.onFileOpen.bind(this);
    this.onMetadataChanged = this.onMetadataChanged.bind(this);
    this.onActiveLeafChange = this.onActiveLeafChange.bind(this);

    this.onHoverDay = this.onHoverDay.bind(this);
    this.onHoverWeek = this.onHoverWeek.bind(this);
    this.onPointerLeave = this.onPointerLeave.bind(this);

    this.onContextMenuDay = this.onContextMenuDay.bind(this);
    this.onContextMenuWeek = this.onContextMenuWeek.bind(this);

    this.registerEvent(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (<any>this.app.workspace).on(
        "periodic-notes:settings-updated",
        this.onNoteSettingsUpdate
      )
    );
    this.registerEvent(this.app.vault.on("create", this.onFileCreated));
    this.registerEvent(this.app.vault.on("delete", this.onFileDeleted));
    this.registerEvent(this.app.vault.on("modify", this.onFileModified));
    this.registerEvent(this.app.vault.on("rename", this.onFileRenamed));
    this.registerEvent(this.app.workspace.on("file-open", this.onFileOpen));
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", this.onActiveLeafChange)
    );
    this.registerEvent(
      this.app.metadataCache.on("changed", this.onMetadataChanged)
    );

    this.settings = null;
    this.register(
      settings.subscribe((value) => {
        const shouldRefreshDateTags =
          !this.settings ||
          this.settings.showDateTags !== value.showDateTags;
        this.settings = value;

        dailyNotes.reindex();
        weeklyNotes.reindex();
        if (shouldRefreshDateTags) {
          void dateTags.reindex(value.showDateTags);
        }

        if (this.calendar) {
          this.calendar.tick();
        }
      })
    );
  }

  getViewType(): string {
    return VIEW_TYPE_CALENDAR;
  }

  getDisplayText(): string {
    return "Calendar";
  }

  getIcon(): string {
    return "calendar-with-checkmark";
  }

  onClose(): Promise<void> {
    this.dismissHoverPopover();
    if (this.calendar) {
      this.calendar.$destroy();
    }
    return Promise.resolve();
  }

  async onOpen(): Promise<void> {
    const sources = [
      customTagsSource,
      streakSource,
      wordCountSource,
      tasksSource,
      dateTagsSource,
    ];
    this.app.workspace.trigger(TRIGGER_ON_OPEN, sources);

    dailyNotes.reindex();
    weeklyNotes.reindex();
    void dateTags.reindex(this.settings.showDateTags);

    this.calendar = new Calendar({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      target: (this as any).contentEl,
      props: {
        onClickDay: (date: Moment, inNewTab: boolean) => {
          void this.openOrCreateDailyNote(date, inNewTab);
          return true;
        },
        onClickWeek: (date: Moment, inNewTab: boolean) => {
          void this.openOrCreateWeeklyNote(date, inNewTab);
          return true;
        },
        onClickMonth: (date: Moment, inNewTab: boolean) => {
          void this.openOrCreatePeriodicNote("month", date, inNewTab);
          return true;
        },
        onClickQuarter: (date: Moment, inNewTab: boolean) => {
          void this.openOrCreatePeriodicNote("quarter", date, inNewTab);
          return true;
        },
        onClickYear: (date: Moment, inNewTab: boolean) => {
          void this.openOrCreatePeriodicNote("year", date, inNewTab);
          return true;
        },
        onHoverDay: this.onHoverDay,
        onHoverWeek: this.onHoverWeek,
        onContextMenuDay: this.onContextMenuDay,
        onContextMenuWeek: this.onContextMenuWeek,
        onPointerLeave: this.onPointerLeave,
        onNavigateDailyNote: (date: Moment) => {
          void this.navigateToExistingDailyNote(date);
        },
        sources,
      },
    });
    this.updateActiveFile();
  }

  private getDailyIndexOptions(): DailyNoteIndexOptions {
    return {
      metadataDateFormat: this.settings?.metadataDateFormat,
      metadataDateProperty: this.settings?.metadataDateProperty,
      useMetadataDates: this.settings?.useMetadataDates,
    };
  }

  private dismissHoverPopover(): void {
    this.hoverPopover?.unload();
    this.hoverPopover = null;
  }

  private onPointerLeave(): void {
    this.dismissHoverPopover();
  }

  private onActiveLeafChange(leaf: WorkspaceLeaf | null): void {
    if (leaf !== this.leaf) {
      this.dismissHoverPopover();
    }
  }

  onHoverDay(
    date: Moment,
    targetEl: EventTarget,
    isMetaPressed = false
  ): boolean {
    if (!isMetaPressed) {
      this.dismissHoverPopover();
      return false;
    }

    const note = getDailyNoteForDate(date, get(dailyNotes));
    const dateTagEntry = getDateTagEntries(date, get(dateTags))[0];
    const targetFile = note || dateTagEntry?.file;
    if (!targetFile) {
      return false;
    }

    const { format } = getDailyNoteSettings();
    this.app.workspace.trigger(
      "link-hover",
      this,
      targetEl,
      note ? date.format(format) : targetFile.path,
      targetFile.path
    );
    return true;
  }

  onHoverWeek(
    date: Moment,
    targetEl: EventTarget,
    isMetaPressed = false
  ): boolean {
    if (!isMetaPressed) {
      this.dismissHoverPopover();
      return false;
    }
    const note = getWeeklyNoteForDate(date, get(weeklyNotes));
    if (!note) {
      return false;
    }

    const { format } = getWeeklyNoteSettings();
    this.app.workspace.trigger(
      "link-hover",
      this,
      targetEl,
      date.format(format),
      note.path
    );
    return true;
  }

  private onContextMenuDay(date: Moment, event: MouseEvent): boolean {
    const notes = getDailyNotesForDate(date, get(dailyNotes));
    const taggedEntries = getDateTagEntries(date, get(dateTags));
    if (!notes.length && !taggedEntries.length) {
      return false;
    }

    if (notes.length === 1 && !taggedEntries.length) {
      showFileMenu(this.app, notes[0], { x: event.pageX, y: event.pageY });
      return true;
    }

    const menu = new Menu();
    notes.forEach((note) => {
      menu.addItem((item) =>
        item.setTitle(`Open daily note: ${note.path}`).onClick(() => {
          void this.openDailyFile(note, date, event.metaKey || event.ctrlKey);
        })
      );
    });
    if (notes.length && taggedEntries.length) {
      menu.addSeparator();
    }
    taggedEntries.forEach((entry) => {
      menu.addItem((item) =>
        item
          .setTitle(`Open dated item: ${entry.description}`)
          .setIcon("calendar")
          .onClick(() => {
            void this.openNoteFile(
              entry.file,
              event.metaKey || event.ctrlKey,
              date
            );
          })
      );
    });
    menu.showAtMouseEvent(event);
    return true;
  }

  private onContextMenuWeek(date: Moment, event: MouseEvent): boolean {
    const note = getWeeklyNoteForDate(date, get(weeklyNotes));
    if (!note) {
      return false;
    }
    showFileMenu(this.app, note, { x: event.pageX, y: event.pageY });
    return true;
  }

  private onNoteSettingsUpdate(): void {
    this.refreshCalendarData();
  }

  private onFileDeleted(_file: TFile): void {
    this.refreshCalendarData();
  }

  private onFileModified(_file: TFile): void {
    this.refreshCalendarData();
  }

  private onFileCreated(_file: TFile): void {
    this.refreshCalendarData();
  }

  private onFileRenamed(_file: TFile): void {
    this.refreshCalendarData();
  }

  private onMetadataChanged(_file: TFile): void {
    this.refreshCalendarData();
  }

  private refreshCalendarData(): void {
    if (!this.app.workspace.layoutReady) {
      return;
    }
    dailyNotes.reindex();
    weeklyNotes.reindex();
    void dateTags.reindex(this.settings.showDateTags);
    this.updateActiveFile();
  }

  public onFileOpen(_file: TFile): void {
    if (this.app.workspace.layoutReady) {
      this.updateActiveFile();
    }
  }

  private updateActiveFile(): void {
    const { view } = this.app.workspace.activeLeaf || {};

    let file: TFile | null = null;
    if (view instanceof FileView) {
      file = view.file;
    }
    activeFile.setFile(file);

    if (this.calendar) {
      this.calendar.tick();
    }
  }

  public revealActiveNote(): void {
    const { activeLeaf } = this.app.workspace;

    if (activeLeaf?.view instanceof FileView) {
      let date = getDateFromCalendarDailyNote(
        activeLeaf.view.file,
        this.getDailyIndexOptions()
      );
      if (date) {
        this.calendar.$set({ displayedMonth: date });
        return;
      }

      date = getDateFromWeeklyNoteFile(activeLeaf.view.file);
      if (date) {
        this.calendar.$set({ displayedMonth: date });
      }
    }
  }

  private async openNoteFile(
    file: TFile,
    inNewTab: boolean,
    selectedDailyDate?: Moment
  ): Promise<void> {
    const { workspace } = this.app;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mode = (this.app.vault as any).getConfig("defaultViewMode");
    const leaf = getNoteLeaf(inNewTab);
    await leaf.openFile(file, { active: true, state: { mode } });
    activeFile.setFile(file, selectedDailyDate);
    workspace.setActiveLeaf(leaf, { focus: true });
  }

  private async openDailyFile(
    file: TFile,
    date: Moment,
    inNewTab: boolean
  ): Promise<void> {
    await this.openNoteFile(file, inNewTab, date);
  }

  async openOrCreateWeeklyNote(
    date: Moment,
    inNewTab: boolean
  ): Promise<void> {
    const startOfWeek = date.clone().startOf("week");
    const existingFile = getWeeklyNoteForDate(date, get(weeklyNotes));

    if (!existingFile) {
      await tryToCreateWeeklyNote(startOfWeek, inNewTab, this.settings, (file) => {
        activeFile.setFile(file);
      });
      return;
    }

    await this.openNoteFile(existingFile, inNewTab);
  }

  async openOrCreateDailyNote(
    date: Moment,
    inNewTab: boolean
  ): Promise<void> {
    const existingFiles = getDailyNotesForDate(date, get(dailyNotes));
    if (!existingFiles.length) {
      await tryToCreateDailyNote(date, inNewTab, this.settings, (dailyNote) => {
        activeFile.setFile(dailyNote, date);
      });
      return;
    }

    if (existingFiles.length > 1) {
      showFilePicker({
        files: existingFiles,
        onChoose: (file) => this.openDailyFile(file, date, inNewTab),
        text: "More than one note is associated with this date.",
        title: `Choose a note for ${date.format("LL")}`,
      });
      return;
    }

    await this.openDailyFile(existingFiles[0], date, inNewTab);
  }

  async openOrCreatePeriodicNote(
    granularity: HeaderNoteGranularity,
    date: Moment,
    inNewTab: boolean
  ): Promise<void> {
    const interval = periodicIntervalForHeader[granularity];
    if (!appHasPeriodicNotesPluginLoaded(interval)) {
      new Notice(
        `Enable ${interval.replace(/^./, (letter) => letter.toUpperCase())} Notes in Periodic Notes first.`
      );
      return;
    }

    const existingFile = getExistingPeriodicNote(granularity, date);
    if (existingFile) {
      await this.openNoteFile(existingFile, inNewTab);
      return;
    }

    await tryToCreatePeriodicNote(
      granularity,
      date,
      inNewTab,
      this.settings,
      (file) => activeFile.setFile(file)
    );
  }

  private async navigateToExistingDailyNote(date: Moment): Promise<void> {
    await this.openOrCreateDailyNote(date, false);
    this.calendar?.$set({ displayedMonth: date });
  }
}
