<svelte:options immutable />

<script lang="ts">
  import type { Moment } from "moment";
  import {
    Calendar as CalendarBase,
    configureGlobalMomentLocale,
  } from "obsidian-calendar-ui";
  import type { ICalendarSource } from "obsidian-calendar-ui";
  import { afterUpdate, onDestroy } from "svelte";

  import {
    getAdjacentDailyNote,
    getDateFromDailyNoteFile,
  } from "../io/dailyNotesIndex";
  import type { DailyNoteEntry } from "../io/dailyNotesIndex";
  import type { ISettings } from "src/settings";
  import { activeFile, dailyNotes, settings, weeklyNotes } from "./stores";

  let today: Moment;
  let calendarEl: HTMLDivElement;

  $: today = getToday($settings);

  export let displayedMonth: Moment = today;
  export let sources: ICalendarSource[];
  export let onHoverDay: (
    date: Moment,
    targetEl: EventTarget,
    isMetaPressed?: boolean
  ) => boolean;
  export let onHoverWeek: (
    date: Moment,
    targetEl: EventTarget,
    isMetaPressed?: boolean
  ) => boolean;
  export let onClickDay: (date: Moment, isMetaPressed: boolean) => boolean;
  export let onClickWeek: (date: Moment, isMetaPressed: boolean) => boolean;
  export let onContextMenuDay: (date: Moment, event: MouseEvent) => boolean;
  export let onContextMenuWeek: (date: Moment, event: MouseEvent) => boolean;
  export let onNavigateDailyNote: (date: Moment) => void = () => undefined;

  let activeDailyDate: Moment | null;
  let previousDailyNote: DailyNoteEntry | null;
  let nextDailyNote: DailyNoteEntry | null;

  export function tick() {
    today = window.moment();
  }

  function getToday(settings: ISettings) {
    configureGlobalMomentLocale(settings.localeOverride, settings.weekStart);
    dailyNotes.reindex();
    weeklyNotes.reindex();
    return window.moment();
  }

  $: activeDailyDate = $dailyNotes?.[$activeFile]
    ? getDateFromDailyNoteFile($dailyNotes[$activeFile])
    : null;
  $: previousDailyNote = activeDailyDate
    ? getAdjacentDailyNote(activeDailyDate, $dailyNotes || {}, "previous")
    : null;
  $: nextDailyNote = activeDailyDate
    ? getAdjacentDailyNote(activeDailyDate, $dailyNotes || {}, "next")
    : null;

  function navigateToDailyNote(note: DailyNoteEntry | null): void {
    if (note) {
      onNavigateDailyNote(note.date);
    }
  }

  afterUpdate(() => {
    const format = $settings.weekdayLabelFormat || "ddd";
    const singleLetter = format === "d";
    calendarEl?.querySelectorAll<HTMLTableCellElement>("thead th").forEach((heading, index) => {
      if ($settings.showWeeklyNote && index === 0) return;
      const dayIndex = $settings.showWeeklyNote ? index - 1 : index;
      const label = today.clone().startOf("week").add(dayIndex, "day").format(singleLetter ? "dd" : format);
      heading.textContent = singleLetter ? label.charAt(0) : label;
    });
  });

  // 1 minute heartbeat to keep `today` reflecting the current day
  let heartbeat = setInterval(() => {
    tick();

    const isViewingCurrentMonth = displayedMonth.isSame(today, "day");
    if (isViewingCurrentMonth) {
      // if it's midnight on the last day of the month, this will
      // update the display to show the new month.
      displayedMonth = today;
    }
  }, 1000 * 60);

  onDestroy(() => {
    clearInterval(heartbeat);
  });
</script>

<div bind:this={calendarEl}>
  <CalendarBase
  {sources}
  {today}
  {onHoverDay}
  {onHoverWeek}
  {onContextMenuDay}
  {onContextMenuWeek}
  {onClickDay}
  {onClickWeek}
  bind:displayedMonth
  localeData={today.localeData()}
  selectedId={$activeFile}
  showWeekNums={$settings.showWeeklyNote}
  />

  <div class="existing-note-navigation" aria-label="Daily note navigation">
    <button
      aria-label="Open previous existing daily note"
      disabled={!previousDailyNote}
      on:click={() => navigateToDailyNote(previousDailyNote)}
      type="button"
    >
      Prev
    </button>
    <button
      aria-label="Open next existing daily note"
      disabled={!nextDailyNote}
      on:click={() => navigateToDailyNote(nextDailyNote)}
      type="button"
    >
      Next
    </button>
  </div>
</div>

<style>
  .existing-note-navigation {
    display: flex;
    gap: 0.5em;
    justify-content: center;
    margin-top: 0.5em;
  }

  .existing-note-navigation button {
    color: var(--text-muted);
    font-size: 0.7em;
    text-transform: uppercase;
  }
</style>
