<!--
  A local, instance-safe adaptation of obsidian-calendar-ui (MIT, Liam Cain).
  Unlike the upstream component, it never changes Moment's global locale.
-->
<svelte:options immutable />

<script lang="ts">
  import type { Moment } from "moment";
  import type {
    ILocaleOverride,
    IWeekStartOption,
  } from "obsidian-calendar-ui";

  import type { CalendarViewMode } from "../../settings";
  import { getCalendarMonth } from "./calendarMath";
  import {
    getCalendarWeekStartIndex,
    getCalendarWeekdayLabels,
    resolveCalendarLocale,
    withCalendarLocale,
  } from "./locale";
  import MonthGrid from "./MonthGrid.svelte";
  import Nav from "./Nav.svelte";
  import type { ICalendarSource } from "./types";
  import YearCalendar from "./YearCalendar.svelte";

  export let localeOverride: ILocaleOverride = "system-default";
  export let weekStart: IWeekStartOption = "locale";
  export let weekdayLabelFormat: string = "ddd";
  export let showWeekNums: boolean = false;
  /** Changes whenever cached year metadata must be recomputed. */
  export let metadataKey: string = "";
  export let viewMode: CalendarViewMode = "month";
  export let onViewModeChange: (viewMode: CalendarViewMode) => void = () =>
    undefined;

  export let onHoverDay: (
    date: Moment,
    targetEl: EventTarget,
    isMetaPressed: boolean
  ) => boolean;
  export let onHoverWeek: (
    date: Moment,
    targetEl: EventTarget,
    isMetaPressed: boolean
  ) => boolean;
  export let onContextMenuDay: (date: Moment, event: MouseEvent) => boolean;
  export let onContextMenuWeek: (date: Moment, event: MouseEvent) => boolean;
  export let onClickDay: (date: Moment, isMetaPressed: boolean) => boolean;
  export let onClickWeek: (date: Moment, isMetaPressed: boolean) => boolean;

  export let sources: ICalendarSource[] = [];
  export let selectedId: string;
  export let today: Moment = window.moment();
  export let displayedMonth: Moment = today;

  let locale: string;
  let weekStartIndex: number;
  let localeFirstDayOfYear: number;
  let localizedToday: Moment;
  let localizedDisplayedMonth: Moment;
  let month;
  let daysOfWeek: string[];

  let isMobile = Boolean(
    (window.app as unknown as { isMobile?: boolean }).isMobile
  );

  $: locale = resolveCalendarLocale(localeOverride);
  $: weekStartIndex = getCalendarWeekStartIndex(locale, weekStart);
  $: localeFirstDayOfYear = window.moment.localeData(locale).firstDayOfYear();
  $: localizedToday = withCalendarLocale(today, locale);
  $: localizedDisplayedMonth = withCalendarLocale(displayedMonth, locale);
  $: month = getCalendarMonth(
    localizedDisplayedMonth,
    locale,
    weekStartIndex,
    localeFirstDayOfYear
  );
  $: daysOfWeek = getCalendarWeekdayLabels(
    localizedToday,
    locale,
    weekStartIndex,
    weekdayLabelFormat
  );

  export function incrementDisplayedMonth(): void {
    displayedMonth = localizedDisplayedMonth
      .clone()
      .add(1, viewMode === "year" ? "year" : "month");
  }

  export function decrementDisplayedMonth(): void {
    displayedMonth = localizedDisplayedMonth
      .clone()
      .subtract(1, viewMode === "year" ? "year" : "month");
  }

  export function resetDisplayedMonth(): void {
    displayedMonth = localizedToday.clone();
  }

  function toggleViewMode(): void {
    onViewModeChange(viewMode === "month" ? "year" : "month");
  }

  function selectMonth(monthToDisplay: Moment): void {
    displayedMonth = monthToDisplay.clone();
    onViewModeChange("month");
  }
</script>

<div id="calendar-container" class="container" class:is-mobile={isMobile}>
  <Nav
    today={localizedToday}
    displayedMonth={localizedDisplayedMonth}
    {locale}
    {viewMode}
    {incrementDisplayedMonth}
    {decrementDisplayedMonth}
    {resetDisplayedMonth}
    onToggleView={toggleViewMode}
  />
  {#if viewMode === "year"}
    <YearCalendar
      displayedMonth={localizedDisplayedMonth}
      today={localizedToday}
      {locale}
      weekStart={weekStartIndex}
      {localeFirstDayOfYear}
      {daysOfWeek}
      {sources}
      {selectedId}
      {showWeekNums}
      {metadataKey}
      {onHoverDay}
      {onHoverWeek}
      {onContextMenuDay}
      {onContextMenuWeek}
      {onClickDay}
      {onClickWeek}
      onSelectMonth={selectMonth}
    />
  {:else}
    <MonthGrid
      {month}
      displayedMonth={localizedDisplayedMonth}
      today={localizedToday}
      {daysOfWeek}
      {sources}
      {selectedId}
      weekStart={weekStartIndex}
      {showWeekNums}
      {onHoverDay}
      {onHoverWeek}
      {onContextMenuDay}
      {onContextMenuWeek}
      {onClickDay}
      {onClickWeek}
    />
  {/if}
</div>

<style>
  .container {
    --color-background-heading: transparent;
    --color-background-day: transparent;
    --color-background-weeknum: transparent;
    --color-background-weekend: transparent;

    --color-dot: var(--text-muted);
    --color-arrow: var(--text-muted);
    --color-button: var(--text-muted);

    --color-text-title: var(--text-normal);
    --color-text-heading: var(--text-muted);
    --color-text-day: var(--text-normal);
    --color-text-today: var(--interactive-accent);
    --color-text-weeknum: var(--text-muted);
  }

  .container {
    padding: 0 8px;
  }

  .container.is-mobile {
    padding: 0;
  }
</style>
