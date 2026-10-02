import { App, PluginSettingTab, Setting } from "obsidian";
import { appHasDailyNotesPluginLoaded } from "obsidian-daily-notes-interface";
import type { ILocaleOverride, IWeekStartOption } from "obsidian-calendar-ui";

import { DEFAULT_WEEK_FORMAT, DEFAULT_WORDS_PER_DOT } from "src/constants";

import type CalendarPlugin from "./main";

export type CalendarViewMode = "month" | "year";

export interface ISettings {
  /** The layout initially shown in a Calendar tab or embedded calendar. */
  calendarView: CalendarViewMode;
  wordsPerDot: number;
  weekdayLabelFormat: string;
  weekStart: IWeekStartOption;
  shouldConfirmBeforeCreate: boolean;

  // Additional calendar links
  showMonthlyNote: boolean;
  showQuarterlyNote: boolean;
  showYearlyNote: boolean;

  // Weekly Note settings
  showWeeklyNote: boolean;
  weeklyNoteFormat: string;
  weeklyNoteTemplate: string;
  weeklyNoteFolder: string;

  // Notes associated through metadata or date tags
  showDateTags: boolean;
  useMetadataDates: boolean;
  metadataDateProperty: string;
  metadataDateFormat: string;

  localeOverride: ILocaleOverride;
}

const weekdays = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export const defaultSettings = Object.freeze({
  calendarView: "month" as CalendarViewMode,
  shouldConfirmBeforeCreate: true,
  weekStart: "locale" as IWeekStartOption,

  wordsPerDot: DEFAULT_WORDS_PER_DOT,
  weekdayLabelFormat: "ddd",

  showMonthlyNote: false,
  showQuarterlyNote: false,
  showYearlyNote: false,

  showWeeklyNote: false,
  weeklyNoteFormat: "",
  weeklyNoteTemplate: "",
  weeklyNoteFolder: "",

  showDateTags: true,
  useMetadataDates: false,
  metadataDateProperty: "date",
  metadataDateFormat: "YYYY-MM-DD",

  localeOverride: "system-default",
});

export type PeriodicNotesInterval =
  | "weekly"
  | "monthly"
  | "quarterly"
  | "yearly";

export function appHasPeriodicNotesPluginLoaded(
  interval: PeriodicNotesInterval = "weekly"
): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const periodicNotes = (<any>window.app).plugins.getPlugin("periodic-notes");
  return Boolean(periodicNotes?.settings?.[interval]?.enabled);
}

export class CalendarSettingsTab extends PluginSettingTab {
  private plugin: CalendarPlugin;

  constructor(app: App, plugin: CalendarPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    this.containerEl.empty();

    if (!appHasDailyNotesPluginLoaded()) {
      this.containerEl.createDiv("settings-banner", (banner) => {
        banner.createEl("h3", {
          text: "⚠️ Daily Notes plugin not enabled",
        });
        banner.createEl("p", {
          cls: "setting-item-description",
          text:
            "The calendar is best used in conjunction with either the Daily Notes plugin or the Periodic Notes plugin (available in the Community Plugins catalog).",
        });
      });
    }

    this.containerEl.createEl("h3", {
      text: "General Settings",
    });
    this.addDotThresholdSetting();
    this.addCalendarViewSetting();
    this.addWeekdayLabelFormatSetting();
    this.addWeekStartSetting();
    this.addConfirmCreateSetting();
    this.addShowWeeklyNoteSetting();
    this.addPeriodicHeaderSettings();
    this.addDateAssociationSettings();

    if (
      this.plugin.options.showWeeklyNote &&
      !appHasPeriodicNotesPluginLoaded()
    ) {
      this.containerEl.createEl("h3", {
        text: "Weekly Note Settings",
      });
      this.containerEl.createEl("p", {
        cls: "setting-item-description",
        text:
          "Note: Weekly Note settings are moving. You are encouraged to install the 'Periodic Notes' plugin to keep the functionality in the future.",
      });
      this.addWeeklyNoteFormatSetting();
      this.addWeeklyNoteTemplateSetting();
      this.addWeeklyNoteFolderSetting();
    }

    this.containerEl.createEl("h3", {
      text: "Advanced Settings",
    });
    this.addLocaleOverrideSetting();
  }

  addDotThresholdSetting(): void {
    new Setting(this.containerEl)
      .setName("Words per dot")
      .setDesc("How many words should be represented by a single dot?")
      .addText((textfield) => {
        textfield.setPlaceholder(String(DEFAULT_WORDS_PER_DOT));
        textfield.inputEl.type = "number";
        textfield.setValue(String(this.plugin.options.wordsPerDot));
        textfield.onChange(async (value) => {
          this.plugin.writeOptions(() => ({
            wordsPerDot: value !== "" ? Number(value) : undefined,
          }));
        });
      });
  }

  addCalendarViewSetting(): void {
    new Setting(this.containerEl)
      .setName("Calendar view")
      .setDesc(
        "Choose whether Calendar opens as one month or a twelve-month year overview. Embedded calendars can override this in their code block."
      )
      .addDropdown((dropdown) => {
        dropdown.addOption("month", "Month");
        dropdown.addOption("year", "Year");
        dropdown.setValue(this.plugin.options.calendarView);
        dropdown.onChange(async (value) => {
          await this.plugin.writeOptions(() => ({
            calendarView: value as CalendarViewMode,
          }));
        });
      });
  }

  addWeekStartSetting(): void {
    const { moment } = window;

    const localizedWeekdays = moment.weekdays();
    // `dow` can legitimately be 0 (Sunday), so use nullish fallback rather
    // than `|| 1`. Some locales do not populate Obsidian's bundled week spec.
    const localeWeekStartNum = window._bundledLocaleWeekSpec?.dow ?? 1;
    const localeWeekStart = moment.weekdays()[localeWeekStartNum];

    new Setting(this.containerEl)
      .setName("Start week on:")
      .setDesc(
        "Choose what day of the week to start. Select 'Locale default' to use the default specified by moment.js"
      )
      .addDropdown((dropdown) => {
        dropdown.addOption("locale", `Locale default (${localeWeekStart})`);
        localizedWeekdays.forEach((day, i) => {
          dropdown.addOption(weekdays[i], day);
        });
        dropdown.setValue(this.plugin.options.weekStart);
        dropdown.onChange(async (value) => {
          this.plugin.writeOptions(() => ({
            weekStart: value as IWeekStartOption,
          }));
        });
      });
  }

  addConfirmCreateSetting(): void {
    new Setting(this.containerEl)
      .setName("Confirm before creating new note")
      .setDesc("Show a confirmation modal before creating a new note")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.shouldConfirmBeforeCreate);
        toggle.onChange(async (value) => {
          this.plugin.writeOptions(() => ({
            shouldConfirmBeforeCreate: value,
          }));
        });
      });
  }

  addWeekdayLabelFormatSetting(): void {
    new Setting(this.containerEl)
      .setName("Weekday label format")
      .setDesc("Weekday format: d for M (single letter), dd for Mo, or ddd for Mon.")
      .addText((textfield) => {
        textfield.setPlaceholder("ddd");
        textfield.setValue(this.plugin.options.weekdayLabelFormat || "ddd");
        textfield.onChange(async (value) => {
          await this.plugin.writeOptions(() => ({ weekdayLabelFormat: value.trim() || "ddd" }));
        });
      });
  }

  addShowWeeklyNoteSetting(): void {
    new Setting(this.containerEl)
      .setName("Show week number")
      .setDesc("Enable this to add a column with the week number")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.showWeeklyNote);
        toggle.onChange(async (value) => {
          this.plugin.writeOptions(() => ({ showWeeklyNote: value }));
          this.display(); // show/hide weekly settings
        });
      });
  }

  addPeriodicHeaderSettings(): void {
    this.containerEl.createEl("h3", { text: "Periodic Note Links" });
    this.addPeriodicHeaderSetting(
      "showMonthlyNote",
      "Open monthly note from calendar header",
      "Make the displayed month clickable. Requires Monthly Notes to be enabled in Periodic Notes."
    );
    this.addPeriodicHeaderSetting(
      "showQuarterlyNote",
      "Open quarterly note from calendar header",
      "Add a clickable quarter beside the month. Requires Quarterly Notes to be enabled in Periodic Notes."
    );
    this.addPeriodicHeaderSetting(
      "showYearlyNote",
      "Open yearly note from calendar header",
      "Make the displayed year clickable. Requires Yearly Notes to be enabled in Periodic Notes."
    );
  }

  addPeriodicHeaderSetting(
    option: "showMonthlyNote" | "showQuarterlyNote" | "showYearlyNote",
    name: string,
    description: string
  ): void {
    new Setting(this.containerEl)
      .setName(name)
      .setDesc(description)
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options[option]);
        toggle.onChange(async (value) => {
          await this.plugin.writeOptions(() => ({ [option]: value }));
        });
      });
  }

  addDateAssociationSettings(): void {
    this.containerEl.createEl("h3", { text: "Date Associations" });
    new Setting(this.containerEl)
      .setName("Show date-tagged items")
      .setDesc(
        "Mark dates mentioned as exact #YYYY-MM-DD tags anywhere in the vault. Hover a marked date or use its context menu to see the matching notes."
      )
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.showDateTags);
        toggle.onChange(async (value) => {
          await this.plugin.writeOptions(() => ({ showDateTags: value }));
        });
      });

    new Setting(this.containerEl)
      .setName("Use frontmatter dates as daily notes")
      .setDesc(
        "Associate any note with a calendar day from a frontmatter property, useful for imported journals with more than one note per day."
      )
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.useMetadataDates);
        toggle.onChange(async (value) => {
          await this.plugin.writeOptions(() => ({ useMetadataDates: value }));
          this.display();
        });
      });

    if (this.plugin.options.useMetadataDates) {
      new Setting(this.containerEl)
        .setName("Frontmatter date property")
        .setDesc("The frontmatter key to read, such as date or created.")
        .addText((textfield) => {
          textfield.setPlaceholder("date");
          textfield.setValue(this.plugin.options.metadataDateProperty || "date");
          textfield.onChange(async (value) => {
            await this.plugin.writeOptions(() => ({
              metadataDateProperty: value.trim() || "date",
            }));
          });
        });

      new Setting(this.containerEl)
        .setName("Frontmatter date format")
        .setDesc(
          "Moment format for the property. ISO dates and ISO timestamps are accepted automatically."
        )
        .addText((textfield) => {
          textfield.setPlaceholder("YYYY-MM-DD");
          textfield.setValue(this.plugin.options.metadataDateFormat || "YYYY-MM-DD");
          textfield.onChange(async (value) => {
            await this.plugin.writeOptions(() => ({
              metadataDateFormat: value.trim() || "YYYY-MM-DD",
            }));
          });
        });
    }
  }

  addWeeklyNoteFormatSetting(): void {
    new Setting(this.containerEl)
      .setName("Weekly note format")
      .setDesc("For more syntax help, refer to format reference")
      .addText((textfield) => {
        textfield.setValue(this.plugin.options.weeklyNoteFormat);
        textfield.setPlaceholder(DEFAULT_WEEK_FORMAT);
        textfield.onChange(async (value) => {
          this.plugin.writeOptions(() => ({ weeklyNoteFormat: value }));
        });
      });
  }

  addWeeklyNoteTemplateSetting(): void {
    new Setting(this.containerEl)
      .setName("Weekly note template")
      .setDesc(
        "Choose the file you want to use as the template for your weekly notes"
      )
      .addText((textfield) => {
        textfield.setValue(this.plugin.options.weeklyNoteTemplate);
        textfield.onChange(async (value) => {
          this.plugin.writeOptions(() => ({ weeklyNoteTemplate: value }));
        });
      });
  }

  addWeeklyNoteFolderSetting(): void {
    new Setting(this.containerEl)
      .setName("Weekly note folder")
      .setDesc("New weekly notes will be placed here")
      .addText((textfield) => {
        textfield.setValue(this.plugin.options.weeklyNoteFolder);
        textfield.onChange(async (value) => {
          this.plugin.writeOptions(() => ({ weeklyNoteFolder: value }));
        });
      });
  }

  addLocaleOverrideSetting(): void {
    const { moment } = window;

    const sysLocale = navigator.language?.toLowerCase();

    new Setting(this.containerEl)
      .setName("Override locale:")
      .setDesc(
        "Set this if you want to use a locale different from the default"
      )
      .addDropdown((dropdown) => {
        dropdown.addOption("system-default", `Same as system (${sysLocale})`);
        moment.locales().forEach((locale) => {
          dropdown.addOption(locale, locale);
        });
        dropdown.setValue(this.plugin.options.localeOverride);
        dropdown.onChange(async (value) => {
          this.plugin.writeOptions(() => ({
            localeOverride: value as ILocaleOverride,
          }));
        });
      });
  }
}
