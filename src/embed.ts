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
        onClickDay: async (date, inNewSplit) =>
          (await this.plugin.getOrCreateCalendarView()).openOrCreateDailyNote(date, inNewSplit),
        onClickWeek: async (date, inNewSplit) =>
          (await this.plugin.getOrCreateCalendarView()).openOrCreateWeeklyNote(date, inNewSplit),
        onHoverDay: () => undefined,
        onHoverWeek: () => undefined,
        onContextMenuDay: () => undefined,
        onContextMenuWeek: () => undefined,
        sources: [customTagsSource, streakSource, wordCountSource, tasksSource],
      },
    });
  }

  onunload(): void {
    this.calendar?.$destroy();
    this.calendar = null;
  }
}
