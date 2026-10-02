<svelte:options immutable />

<script lang="ts">
  import type { Moment } from "moment";

  import { isWeekend } from "./calendarMath";
  import type { ICalendarMonth } from "./calendarMath";
  import Day from "./Day.svelte";
  import { getDailyMetadata, getWeeklyMetadata } from "./metadata";
  import type { ICalendarSource, IDayMetadata } from "./types";
  import WeekNum from "./WeekNum.svelte";

  type MetadataForDate = (date: Moment) => Promise<IDayMetadata>;

  export let month: ICalendarMonth;
  export let displayedMonth: Moment;
  export let today: Moment;
  export let daysOfWeek: string[];
  export let sources: ICalendarSource[] = [];
  export let selectedId: string;
  export let weekStart: number;
  export let showWeekNums: boolean = false;
  export let compact: boolean = false;
  /** Hide duplicate dates from neighboring months in a year overview. */
  export let hideAdjacentMonths: boolean = false;
  /** Optional per-view caches used by the twelve-month layout. */
  export let dailyMetadataForDate: MetadataForDate | null = null;
  export let weeklyMetadataForDate: MetadataForDate | null = null;

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

  function getDayMetadata(date: Moment): Promise<IDayMetadata> {
    return dailyMetadataForDate
      ? dailyMetadataForDate(date)
      : getDailyMetadata(sources, date);
  }

  function getWeekMetadata(date: Moment): Promise<IDayMetadata> {
    return weeklyMetadataForDate
      ? weeklyMetadataForDate(date)
      : getWeeklyMetadata(sources, date);
  }
</script>

<table class="calendar" class:compact aria-label={displayedMonth.format("MMMM YYYY")}>
  <colgroup>
    {#if showWeekNums}
      <col />
    {/if}
    {#each month[0].days as date}
      <col class:weekend={isWeekend(date)} />
    {/each}
  </colgroup>
  <thead>
    <tr>
      {#if showWeekNums}
        <th scope="col">W</th>
      {/if}
      {#each daysOfWeek as dayOfWeek}
        <th scope="col">{dayOfWeek}</th>
      {/each}
    </tr>
  </thead>
  <tbody>
    {#each month as week (week.days[0].format())}
      <tr>
        {#if showWeekNums}
          <WeekNum
            {...week}
            {weekStart}
            metadata={getWeekMetadata(week.days[0])}
            onClick={onClickWeek}
            onContextMenu={onContextMenuWeek}
            onHover={onHoverWeek}
            {selectedId}
            {compact}
          />
        {/if}
        {#each week.days as date (date.format())}
          {#if hideAdjacentMonths && !date.isSame(displayedMonth, "month")}
            <td class="empty" aria-hidden="true"></td>
          {:else}
            <Day
              {date}
              {today}
              {displayedMonth}
              metadata={getDayMetadata(date)}
              onClick={onClickDay}
              onContextMenu={onContextMenuDay}
              onHover={onHoverDay}
              {selectedId}
              {compact}
            />
          {/if}
        {/each}
      </tr>
    {/each}
  </tbody>
</table>

<style>
  .calendar {
    border-collapse: collapse;
    width: 100%;
  }

  th {
    background-color: var(--color-background-heading);
    color: var(--color-text-heading);
    font-size: 0.6em;
    letter-spacing: 1px;
    padding: 4px;
    text-align: center;
    text-transform: uppercase;
  }

  .weekend {
    background-color: var(--color-background-weekend);
  }

  .empty {
    padding: 0;
  }

  .compact {
    font-size: 0.88em;
    table-layout: fixed;
  }

  .compact th {
    font-size: 0.55em;
    letter-spacing: 0;
    padding: 2px 0;
  }
</style>
