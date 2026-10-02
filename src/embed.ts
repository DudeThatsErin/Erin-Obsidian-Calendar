import { MarkdownRenderChild } from "obsidian";

import type CalendarPlugin from "./main";
import Calendar from "./ui/Calendar.svelte";
import {
  customTagsSource,
  dateTagsSource,
  streakSource,
  tasksSource,
  wordCountSource,
} from "./ui/sources";
import { dateTags } from "./ui/stores";

/** Renders ```erin-calendar blocks in reading view. */
export class CalendarEmbed extends MarkdownRenderChild {
  private calendar: Calendar | null = null;

  constructor(containerEl: HTMLElement, private plugin: CalendarPlugin) {
    super(containerEl);
  }

  onload(): void {
    this.containerEl.addClass("erin-calendar-embed");
    void dateTags.reindex(this.plugin.options.showDateTags);
    this.calendar = new Calendar({
      target: this.containerEl,
      props: {
        onClickDay: (date, inNewSplit) => {
          void this.plugin
            .getOrCreateCalendarView()
            .then((view) => view.openOrCreateDailyNote(date, inNewSplit));
          return true;
        },
        onClickWeek: (date, inNewSplit) => {
          void this.plugin
            .getOrCreateCalendarView()
            .then((view) => view.openOrCreateWeeklyNote(date, inNewSplit));
          return true;
        },
        onClickMonth: (date, inNewSplit) => {
          void this.plugin
            .getOrCreateCalendarView()
            .then((view) => view.openOrCreatePeriodicNote("month", date, inNewSplit));
          return true;
        },
        onClickQuarter: (date, inNewSplit) => {
          void this.plugin
            .getOrCreateCalendarView()
            .then((view) => view.openOrCreatePeriodicNote("quarter", date, inNewSplit));
          return true;
        },
        onClickYear: (date, inNewSplit) => {
          void this.plugin
            .getOrCreateCalendarView()
            .then((view) => view.openOrCreatePeriodicNote("year", date, inNewSplit));
          return true;
        },
        onHoverDay: () => true,
        onHoverWeek: () => true,
        onContextMenuDay: () => true,
        onContextMenuWeek: () => true,
        onNavigateDailyNote: (date) => {
          void this.plugin
            .getOrCreateCalendarView()
            .then((view) => view.openOrCreateDailyNote(date, false));
        },
        sources: [
          customTagsSource,
          streakSource,
          wordCountSource,
          tasksSource,
          dateTagsSource,
        ],
      },
    });
  }

  onunload(): void {
    this.calendar?.$destroy();
    this.calendar = null;
  }
}
