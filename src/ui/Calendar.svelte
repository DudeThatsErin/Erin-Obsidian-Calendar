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
  } from "../io/dailyNotesIndex";
  import type { DailyNoteEntry } from "../io/dailyNotesIndex";
  import type { ISettings } from "src/settings";
  import {
    activeDailyDate,
    activeFile,
    dailyNotes,
    dateTags,
    settings,
    weeklyNotes,
  } from "./stores";

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
  export let onClickMonth: (date: Moment, isMetaPressed: boolean) => boolean =
    () => false;
  export let onClickQuarter: (date: Moment, isMetaPressed: boolean) => boolean =
    () => false;
  export let onClickYear: (date: Moment, isMetaPressed: boolean) => boolean =
    () => false;
  export let onPointerLeave: () => void = () => undefined;

  let selectedDailyDate: Moment | null;
  let previousDailyNote: DailyNoteEntry | null;
  let nextDailyNote: DailyNoteEntry | null;
  let calendarKey: string;

  export function tick() {
    today = window.moment();
  }

  function getToday(settings: ISettings) {
    configureGlobalMomentLocale(settings.localeOverride, settings.weekStart);
    dailyNotes.reindex();
    weeklyNotes.reindex();
    return window.moment();
  }

  $: selectedDailyDate = $activeDailyDate;
  $: previousDailyNote = selectedDailyDate
    ? getAdjacentDailyNote(selectedDailyDate, $dailyNotes, "previous")
    : null;
  $: nextDailyNote = selectedDailyDate
    ? getAdjacentDailyNote(selectedDailyDate, $dailyNotes, "next")
    : null;
  $: calendarKey = `${$settings.localeOverride}:${$settings.weekStart}:${$dateTags.version}`;

  function navigateToDailyNote(note: DailyNoteEntry | null): void {
    if (note) {
      onNavigateDailyNote(note.date);
    }
  }

  function isNewTabEvent(event: MouseEvent | KeyboardEvent): boolean {
    return event.metaKey || event.ctrlKey;
  }

  function setHeaderAction(
    element: HTMLElement | null,
    enabled: boolean,
    label: string,
    onClick: (event: MouseEvent | KeyboardEvent) => void
  ): void {
    if (!element) {
      return;
    }

    element.classList.toggle("erin-calendar-header-action", enabled);
    if (!enabled) {
      element.removeAttribute("role");
      element.removeAttribute("tabindex");
      element.removeAttribute("aria-label");
      element.onclick = null;
      element.onkeydown = null;
      return;
    }

    element.setAttribute("role", "button");
    element.setAttribute("tabindex", "0");
    element.setAttribute("aria-label", label);
    element.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick(event);
    };
    element.onkeydown = (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      onClick(event);
    };
  }

  function updatePeriodicHeaderActions(): void {
    const title = calendarEl?.querySelector<HTMLElement>(
      "#calendar-container .nav .title"
    );
    const month = title?.querySelector<HTMLElement>(".month") || null;
    const year = title?.querySelector<HTMLElement>(".year") || null;
    let quarter = title?.querySelector<HTMLElement>(
      ".erin-calendar-quarter"
    ) || null;

    if ($settings.showQuarterlyNote && title && year) {
      if (!quarter) {
        quarter = title.ownerDocument.createElement("span");
        quarter.className = "erin-calendar-quarter";
        year.before(quarter);
      }
      quarter.textContent = displayedMonth.format("[Q]Q");
    } else {
      quarter?.remove();
      quarter = null;
    }

    setHeaderAction(
      month,
      $settings.showMonthlyNote,
      "Open monthly note",
      (event) => onClickMonth(displayedMonth.clone(), isNewTabEvent(event))
    );
    setHeaderAction(
      quarter,
      $settings.showQuarterlyNote,
      "Open quarterly note",
      (event) => onClickQuarter(displayedMonth.clone(), isNewTabEvent(event))
    );
    setHeaderAction(
      year,
      $settings.showYearlyNote,
      "Open yearly note",
      (event) => onClickYear(displayedMonth.clone(), isNewTabEvent(event))
    );
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
    updatePeriodicHeaderActions();
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

<div bind:this={calendarEl} on:pointerleave={onPointerLeave}>
  {#key calendarKey}
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
  {/key}

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

  :global(.erin-calendar-header-action) {
    cursor: pointer;
    text-decoration: underline dotted;
    text-underline-offset: 0.15em;
  }

  :global(.erin-calendar-header-action:focus-visible) {
    border-radius: 2px;
    outline: 2px solid var(--interactive-accent);
    outline-offset: 2px;
  }

  :global(.erin-calendar-quarter) {
    color: var(--text-muted);
    font-size: 0.7em;
    margin: 0 0.35em;
  }
</style>
