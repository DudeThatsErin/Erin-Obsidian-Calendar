import { FileView, MarkdownRenderChild } from "obsidian";
import type { TFile } from "obsidian";
import { get, writable } from "svelte/store";
import type { Unsubscriber } from "svelte/store";

import {
  mergeEmbedSettings,
  parseEmbedSettings,
} from "./embedSettings";
import type { EmbedSettingsOverrides } from "./embedSettings";
import type CalendarPlugin from "./main";
import { defaultSettings } from "./settings";
import type { ISettings } from "./settings";
import Calendar from "./ui/Calendar.svelte";
import {
  createCustomTagsSource,
  createDateTagsSource,
  createStreakSource,
  createTasksSource,
  createWordCountSource,
} from "./ui/sources";
import {
  createCalendarSelection,
  createDailyNotesStore,
  createDateTagsStore,
  createWeeklyNotesStore,
  settings,
} from "./ui/stores";
import type { CalendarActionContext } from "./view";

/** Renders `erin-calendar` blocks with settings local to each fenced block. */
export class CalendarEmbed extends MarkdownRenderChild {
  private calendar: Calendar | null = null;
  private settingsUnsubscribe: Unsubscriber | null = null;
  private readonly overrides: EmbedSettingsOverrides;
  private readonly diagnostics: string[];
  private readonly effectiveSettings = writable<ISettings>(defaultSettings);
  private readonly dailyNotes = createDailyNotesStore(this.effectiveSettings);
  private readonly weeklyNotes = createWeeklyNotesStore(this.effectiveSettings);
  private readonly dateTags = createDateTagsStore();
  private readonly selection = createCalendarSelection(this.effectiveSettings);
  private readonly sources = [
    createCustomTagsSource(
      this.dailyNotes,
      this.weeklyNotes,
      this.effectiveSettings
    ),
    createStreakSource(
      this.dailyNotes,
      this.weeklyNotes,
      this.effectiveSettings
    ),
    createWordCountSource(
      this.dailyNotes,
      this.weeklyNotes,
      this.effectiveSettings
    ),
    createTasksSource(
      this.dailyNotes,
      this.weeklyNotes,
      this.effectiveSettings
    ),
    createDateTagsSource(this.dateTags),
  ];

  constructor(
    containerEl: HTMLElement,
    private plugin: CalendarPlugin,
    source: string
  ) {
    super(containerEl);
    const parsedSettings = parseEmbedSettings(source);
    this.overrides = parsedSettings.overrides;
    this.diagnostics = parsedSettings.diagnostics;
  }

  onload(): void {
    this.containerEl.addClass("erin-calendar-embed");
    this.renderDiagnostics();

    this.settingsUnsubscribe = settings.subscribe((globalSettings) => {
      this.effectiveSettings.set(
        mergeEmbedSettings(globalSettings, this.overrides)
      );
      this.refreshCalendarData();
    });

    this.registerEvent(
      this.plugin.app.vault.on("create", this.onCalendarDataChanged)
    );
    this.registerEvent(
      this.plugin.app.vault.on("delete", this.onCalendarDataChanged)
    );
    this.registerEvent(
      this.plugin.app.vault.on("modify", this.onCalendarDataChanged)
    );
    this.registerEvent(
      this.plugin.app.vault.on("rename", this.onCalendarDataChanged)
    );
    this.registerEvent(
      this.plugin.app.metadataCache.on("changed", this.onCalendarDataChanged)
    );
    this.registerEvent(
      this.plugin.app.workspace.on("file-open", this.onCalendarDataChanged)
    );
    this.registerEvent(
      // Periodic Notes changes can alter the inherited weekly note path.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (<any>this.plugin.app.workspace).on(
        "periodic-notes:settings-updated",
        this.onCalendarDataChanged
      )
    );

    this.calendar = new Calendar({
      target: this.containerEl,
      props: {
        onClickDay: (date, inNewSplit) => {
          void this.plugin
            .getOrCreateCalendarView()
            .then((view) =>
              view.openOrCreateDailyNote(
                date,
                inNewSplit,
                this.getActionContext()
              )
            );
          return true;
        },
        onClickWeek: (date, inNewSplit) => {
          void this.plugin
            .getOrCreateCalendarView()
            .then((view) =>
              view.openOrCreateWeeklyNote(
                date,
                inNewSplit,
                this.getActionContext()
              )
            );
          return true;
        },
        onClickMonth: (date, inNewSplit) => {
          void this.plugin
            .getOrCreateCalendarView()
            .then((view) =>
              view.openOrCreatePeriodicNote(
                "month",
                date,
                inNewSplit,
                this.getActionContext()
              )
            );
          return true;
        },
        onClickQuarter: (date, inNewSplit) => {
          void this.plugin
            .getOrCreateCalendarView()
            .then((view) =>
              view.openOrCreatePeriodicNote(
                "quarter",
                date,
                inNewSplit,
                this.getActionContext()
              )
            );
          return true;
        },
        onClickYear: (date, inNewSplit) => {
          void this.plugin
            .getOrCreateCalendarView()
            .then((view) =>
              view.openOrCreatePeriodicNote(
                "year",
                date,
                inNewSplit,
                this.getActionContext()
              )
            );
          return true;
        },
        onHoverDay: () => true,
        onHoverWeek: () => true,
        onContextMenuDay: () => true,
        onContextMenuWeek: () => true,
        onNavigateDailyNote: (date) => {
          void this.plugin
            .getOrCreateCalendarView()
            .then((view) =>
              view.openOrCreateDailyNote(date, false, this.getActionContext())
            );
        },
        sources: this.sources,
        settingsStore: this.effectiveSettings,
        dailyNotesStore: this.dailyNotes,
        weeklyNotesStore: this.weeklyNotes,
        dateTagsStore: this.dateTags,
        activeDailyDateStore: this.selection.activeDailyDate,
        activeFileStore: this.selection.activeFile,
      },
    });
    this.updateActiveFile();
  }

  onunload(): void {
    this.settingsUnsubscribe?.();
    this.settingsUnsubscribe = null;
    this.calendar?.$destroy();
    this.calendar = null;
  }

  private readonly onCalendarDataChanged = (): void => {
    this.refreshCalendarData();
  };

  private refreshCalendarData(): void {
    const currentSettings = get(this.effectiveSettings);
    this.dailyNotes.reindex();
    this.weeklyNotes.reindex();
    void this.dateTags.reindex(currentSettings.showDateTags);
    this.updateActiveFile();
    this.calendar?.tick();
  }

  private updateActiveFile(): void {
    const { view } = this.plugin.app.workspace.activeLeaf || {};
    const file = view instanceof FileView ? view.file : null;
    this.selection.activeFile.setFile(file);
  }

  private getActionContext(): CalendarActionContext {
    return {
      settings: get(this.effectiveSettings),
      dailyNotesIndex: get(this.dailyNotes),
      weeklyNotesIndex: get(this.weeklyNotes),
      onFileOpened: (file: TFile, selectedDailyDate) => {
        this.selection.activeFile.setFile(file, selectedDailyDate);
      },
    };
  }

  private renderDiagnostics(): void {
    if (!this.diagnostics.length) {
      return;
    }

    const diagnosticsEl = this.containerEl.createDiv({
      cls: "erin-calendar-embed-diagnostics",
    });
    diagnosticsEl.setAttribute("role", "alert");
    diagnosticsEl.createEl("strong", { text: "Erin Calendar settings:" });
    const list = diagnosticsEl.createEl("ul");
    this.diagnostics.forEach((diagnostic) => {
      list.createEl("li", { text: diagnostic });
    });
  }
}
