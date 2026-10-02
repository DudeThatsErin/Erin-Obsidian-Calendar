<svelte:options immutable />

<script lang="ts">
  import type { Moment } from "moment";
  import type { Readable } from "svelte/store";
  import { afterUpdate, onDestroy } from "svelte";

  import {
    getAdjacentDailyNote,
  } from "../io/dailyNotesIndex";
  import type { DailyNoteEntry, DailyNotesIndex } from "../io/dailyNotesIndex";
  import type { WeeklyNotesIndex } from "../io/weeklyNotesIndex";
  import type { CalendarViewMode, ISettings } from "src/settings";
  import {
    IsolatedCalendar,
    resolveCalendarLocale,
  } from "./isolatedCalendar";
  import type { ICalendarSource } from "./isolatedCalendar";
  import {
    activeDailyDate,
    activeFile,
    dailyNotes,
    dateTags,
    type IndexedDateTags,
    settings,
    weeklyNotes,
  } from "./stores";

  let today: Moment = window.moment();
  let calendarEl: HTMLDivElement;

  export let displayedMonth: Moment = today;
  export let sources: ICalendarSource[];
  /** Each embed may provide its own effective settings and indexed data. */
  export let settingsStore: Readable<ISettings> = settings;
  export let dailyNotesStore: Readable<DailyNotesIndex> = dailyNotes;
  export let weeklyNotesStore: Readable<WeeklyNotesIndex> = weeklyNotes;
  export let dateTagsStore: Readable<IndexedDateTags> = dateTags;
  export let activeDailyDateStore: Readable<Moment | null> = activeDailyDate;
  export let activeFileStore: Readable<string | null> = activeFile;
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
  /** Tabs may persist a user-selected layout; embeds keep it local. */
  export let onCalendarViewChange: (viewMode: CalendarViewMode) => void = () =>
    undefined;
  export let onPointerLeave: () => void = () => undefined;

  let selectedDailyDate: Moment | null;
  let previousDailyNote: DailyNoteEntry | null;
  let nextDailyNote: DailyNoteEntry | null;
  let calendarKey: string;
  let metadataKey: string;
  let displayMode: CalendarViewMode = "month";
  let appliedCalendarView: CalendarViewMode | null = null;
  const indexKeys = new WeakMap<object, number>();
  let nextIndexKey = 0;

  function getIndexKey(index: object | null): number {
    if (!index) {
      return 0;
    }
    let key = indexKeys.get(index);
    if (key === undefined) {
      key = ++nextIndexKey;
      indexKeys.set(index, key);
    }
    return key;
  }

  export function tick(calendarSettings: ISettings = $settingsStore) {
    today = window
      .moment()
      .locale(resolveCalendarLocale(calendarSettings.localeOverride));
  }

  $: tick($settingsStore);
  $: if ($settingsStore.calendarView !== appliedCalendarView) {
    displayMode = $settingsStore.calendarView;
    appliedCalendarView = $settingsStore.calendarView;
  }
  $: selectedDailyDate = $activeDailyDateStore;
  $: previousDailyNote = selectedDailyDate
    ? getAdjacentDailyNote(selectedDailyDate, $dailyNotesStore, "previous")
    : null;
  $: nextDailyNote = selectedDailyDate
    ? getAdjacentDailyNote(selectedDailyDate, $dailyNotesStore, "next")
    : null;
  $: calendarKey = `${$settingsStore.localeOverride}:${$settingsStore.weekStart}:${$dateTagsStore.version}:${getIndexKey($dailyNotesStore)}:${getIndexKey($weeklyNotesStore)}`;
  $: metadataKey = `${calendarKey}:${$settingsStore.wordsPerDot}`;

  function navigateToDailyNote(note: DailyNoteEntry | null): void {
    if (note) {
      onNavigateDailyNote(note.date);
    }
  }

  function isNewTabEvent(event: MouseEvent | KeyboardEvent): boolean {
    return event.metaKey || event.ctrlKey;
  }

  function changeCalendarView(viewMode: CalendarViewMode): void {
    displayMode = viewMode;
    onCalendarViewChange(viewMode);
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

    if (displayMode === "month" && $settingsStore.showQuarterlyNote && title && year) {
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
      displayMode === "month" && $settingsStore.showMonthlyNote,
      "Open monthly note",
      (event) => onClickMonth(displayedMonth.clone(), isNewTabEvent(event))
    );
    setHeaderAction(
      quarter,
      displayMode === "month" && $settingsStore.showQuarterlyNote,
      "Open quarterly note",
      (event) => onClickQuarter(displayedMonth.clone(), isNewTabEvent(event))
    );
    setHeaderAction(
      year,
      $settingsStore.showYearlyNote,
      "Open yearly note",
      (event) => onClickYear(displayedMonth.clone(), isNewTabEvent(event))
    );
  }

  afterUpdate(() => {
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
    <IsolatedCalendar
      {sources}
      {today}
      {onHoverDay}
      {onHoverWeek}
      {onContextMenuDay}
      {onContextMenuWeek}
      {onClickDay}
      {onClickWeek}
      bind:displayedMonth
      viewMode={displayMode}
      onViewModeChange={changeCalendarView}
      {metadataKey}
      localeOverride={$settingsStore.localeOverride}
      weekStart={$settingsStore.weekStart}
      weekdayLabelFormat={$settingsStore.weekdayLabelFormat}
      selectedId={$activeFileStore}
      showWeekNums={$settingsStore.showWeeklyNote}
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
