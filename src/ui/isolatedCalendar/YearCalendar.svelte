<svelte:options immutable />

<script lang="ts">
  import type { Moment } from "moment";

  import {
    getCalendarWeekStart,
    getCalendarYearMonths,
  } from "./calendarMath";
  import { getDailyMetadata, getWeeklyMetadata } from "./metadata";
  import MonthGrid from "./MonthGrid.svelte";
  import type { ICalendarSource, IDayMetadata } from "./types";

  export let displayedMonth: Moment;
  export let today: Moment;
  export let locale: string;
  export let weekStart: number;
  export let localeFirstDayOfYear: number;
  export let daysOfWeek: string[];
  export let sources: ICalendarSource[] = [];
  export let selectedId: string;
  export let showWeekNums: boolean = false;
  /** Provided by the shared wrapper when note or metadata inputs change. */
  export let metadataKey: string = "";

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
  /** Switch from the overview to one selected month. */
  export let onSelectMonth: (month: Moment) => void;

  let months = getCalendarYearMonths(
    displayedMonth,
    locale,
    weekStart,
    localeFirstDayOfYear
  );
  let cachedSources: ICalendarSource[] | null = null;
  let cachedYear: number | null = null;
  let cachedMetadataKey: string | null = null;
  const dailyMetadata = new Map<string, Promise<IDayMetadata>>();
  const weeklyMetadata = new Map<string, Promise<IDayMetadata>>();

  $: months = getCalendarYearMonths(
    displayedMonth,
    locale,
    weekStart,
    localeFirstDayOfYear
  );
  $: if (
    sources !== cachedSources ||
    displayedMonth.year() !== cachedYear ||
    metadataKey !== cachedMetadataKey
  ) {
    cachedSources = sources;
    cachedYear = displayedMonth.year();
    cachedMetadataKey = metadataKey;
    dailyMetadata.clear();
    weeklyMetadata.clear();
  }

  function getCachedDailyMetadata(date: Moment): Promise<IDayMetadata> {
    const key = date.clone().startOf("day").format("YYYY-MM-DD");
    let metadata = dailyMetadata.get(key);
    if (!metadata) {
      metadata = getDailyMetadata(sources, date);
      dailyMetadata.set(key, metadata);
    }
    return metadata;
  }

  function getCachedWeeklyMetadata(date: Moment): Promise<IDayMetadata> {
    const key = getCalendarWeekStart(date, weekStart).format("YYYY-MM-DD");
    let metadata = weeklyMetadata.get(key);
    if (!metadata) {
      metadata = getWeeklyMetadata(sources, date);
      weeklyMetadata.set(key, metadata);
    }
    return metadata;
  }
</script>

<div class="year-calendar" aria-label={`${displayedMonth.format("YYYY")} calendar`}>
  {#each months as calendarMonth (calendarMonth.month.format("YYYY-MM"))}
    <section class="month" aria-label={calendarMonth.month.format("MMMM YYYY")}>
      <h4>
        <button
          class="month-title"
          aria-label={`Show ${calendarMonth.month.format("MMMM YYYY")} as a month`}
          on:click={() => onSelectMonth(calendarMonth.month)}
          type="button"
        >
          {calendarMonth.month.format("MMMM")}
        </button>
      </h4>
      <MonthGrid
        month={calendarMonth.weeks}
        displayedMonth={calendarMonth.month}
        {today}
        {daysOfWeek}
        {sources}
        {selectedId}
        {weekStart}
        {showWeekNums}
        compact={true}
        hideAdjacentMonths={true}
        dailyMetadataForDate={getCachedDailyMetadata}
        weeklyMetadataForDate={getCachedWeeklyMetadata}
        {onHoverDay}
        {onHoverWeek}
        {onContextMenuDay}
        {onContextMenuWeek}
        {onClickDay}
        {onClickWeek}
      />
    </section>
  {/each}
</div>

<style>
  .year-calendar {
    display: grid;
    gap: 1.25em;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  }

  .month {
    min-width: 0;
  }

  h4 {
    margin: 0 0 0.35em;
    text-align: center;
  }

  .month-title {
    background: none;
    border: 0;
    color: var(--color-text-title);
    cursor: pointer;
    font: inherit;
    font-size: 0.88em;
    font-weight: 600;
    padding: 0.15em 0.35em;
  }

  .month-title:hover {
    background: var(--interactive-hover);
    border-radius: 4px;
  }

  .month-title:focus-visible {
    border-radius: 3px;
    outline: 2px solid var(--interactive-accent);
    outline-offset: 2px;
  }
</style>
