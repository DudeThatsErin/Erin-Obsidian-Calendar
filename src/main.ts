import type { Moment, WeekSpec } from "moment";
import { App, Plugin, WorkspaceLeaf } from "obsidian";

import { VIEW_TYPE_CALENDAR } from "./constants";
import { settings } from "./ui/stores";
import {
  appHasPeriodicNotesPluginLoaded,
  CalendarSettingsTab,
  ISettings,
} from "./settings";
import CalendarView from "./view";
import { CalendarEmbed } from "./embed";

declare global {
  interface Window {
    app: App;
    moment: () => Moment;
    _bundledLocaleWeekSpec?: WeekSpec;
  }
}

export default class CalendarPlugin extends Plugin {
  public options: ISettings;
  private view: CalendarView;

  onunload(): void {
    this.app.workspace
      .getLeavesOfType(VIEW_TYPE_CALENDAR)
      .forEach((leaf) => leaf.detach());
  }

  async onload(): Promise<void> {
    this.register(
      settings.subscribe((value) => {
        this.options = value;
      })
    );

    this.registerView(
      VIEW_TYPE_CALENDAR,
      (leaf: WorkspaceLeaf) => (this.view = new CalendarView(leaf))
    );

    this.addCommand({
      id: "show-calendar-view",
      name: "Open view",
      checkCallback: (checking: boolean) => {
        if (checking) {
          return (
            this.app.workspace.getLeavesOfType(VIEW_TYPE_CALENDAR).length === 0
          );
        }
        this.initLeaf();
      },
    });

    this.addCommand({
      id: "open-weekly-note",
      name: "Open Weekly Note",
      checkCallback: (checking) => {
        if (checking) {
          return !appHasPeriodicNotesPluginLoaded();
        }
        void this.getOrCreateCalendarView().then((view) =>
          view.openOrCreateWeeklyNote(window.moment(), false)
        );
      },
    });

    this.addCommand({
      id: "reveal-active-note",
      name: "Reveal active note",
      callback: () =>
        void this.getOrCreateCalendarView().then((view) =>
          view.revealActiveNote()
        ),
    });

    await this.loadOptions();

    this.addSettingTab(new CalendarSettingsTab(this.app, this));
    this.registerMarkdownCodeBlockProcessor("erin-calendar", (_source, el, ctx) => {
      ctx.addChild(new CalendarEmbed(el, this));
    });

    if (this.app.workspace.layoutReady) {
      void this.initLeaf();
    } else {
      this.registerEvent(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this.app.workspace as any).on("layout-ready", () => void this.initLeaf())
      );
    }
  }

  async initLeaf(): Promise<CalendarView> {
    const existingLeaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_CALENDAR)[0];
    if (existingLeaf) return existingLeaf.view as CalendarView;
    const mode = (this.app.vault as unknown as { getConfig: (key: string) => string }).getConfig("defaultViewMode");
    const leaf = this.app.workspace.getRightLeaf(false);
    await leaf.setViewState({
      type: VIEW_TYPE_CALENDAR,
      state: { mode },
    });
    return leaf.view as CalendarView;
  }

  async getOrCreateCalendarView(): Promise<CalendarView> {
    return this.initLeaf();
  }

  async loadOptions(): Promise<void> {
    const options = await this.loadData();
    settings.update((old) => {
      return {
        ...old,
        ...(options || {}),
      };
    });

    await this.saveData(this.options);
  }

  async writeOptions(
    changeOpts: (settings: ISettings) => Partial<ISettings>
  ): Promise<void> {
    settings.update((old) => ({ ...old, ...changeOpts(old) }));
    await this.saveData(this.options);
  }
}
