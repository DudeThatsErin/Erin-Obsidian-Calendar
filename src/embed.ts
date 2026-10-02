import { MarkdownRenderChild } from "obsidian";

import type CalendarPlugin from "./main";
import Calendar from "./ui/Calendar.svelte";
import {
  customTagsSource,
  streakSource,
  tasksSource,
  wordCountSource,
} from "./ui/sources";

/** Renders ```erin-calendar blocks in reading view. */
export class CalendarEmbed extends MarkdownRenderChild {
  private calendar: Calendar | null = null;

  constructor(containerEl: HTMLElement, private plugin: CalendarPlugin) {
    super(containerEl);
  }

  onload(): void {
    this.containerEl.addClass("erin-calendar-embed");
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
        onHoverDay: () => true,
        onHoverWeek: () => true,
        onContextMenuDay: () => true,
        onContextMenuWeek: () => true,
        onNavigateDailyNote: (date) => {
          void this.plugin
            .getOrCreateCalendarView()
            .then((view) => view.openOrCreateDailyNote(date, false));
        },
        sources: [customTagsSource, streakSource, wordCountSource, tasksSource],
      },
    });
  }

  onunload(): void {
    this.calendar?.$destroy();
    this.calendar = null;
  }
}
