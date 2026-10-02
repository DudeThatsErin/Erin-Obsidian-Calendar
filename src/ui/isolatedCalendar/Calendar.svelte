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

  import {
    getCalendarMonth,
    isWeekend,
  } from "./calendarMath";
  import Day from "./Day.svelte";
  import {
    getCalendarWeekStartIndex,
    getCalendarWeekdayLabels,
    resolveCalendarLocale,
    withCalendarLocale,
  } from "./locale";
  import { getDailyMetadata, getWeeklyMetadata } from "./metadata";
  import Nav from "./Nav.svelte";
  import type { ICalendarSource } from "./types";
  import WeekNum from "./WeekNum.svelte";

  export let localeOverride: ILocaleOverride = "system-default";
  export let weekStart: IWeekStartOption = "locale";
  export let weekdayLabelFormat: string = "ddd";
  export let showWeekNums: boolean = false;

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
    displayedMonth = localizedDisplayedMonth.clone().add(1, "month");
  }

  export function decrementDisplayedMonth(): void {
    displayedMonth = localizedDisplayedMonth.clone().subtract(1, "month");
  }

  export function resetDisplayedMonth(): void {
    displayedMonth = localizedToday.clone();
  }
</script>

<div id="calendar-container" class="container" class:is-mobile={isMobile}>
  <Nav
    today={localizedToday}
    displayedMonth={localizedDisplayedMonth}
    {locale}
    {incrementDisplayedMonth}
    {decrementDisplayedMonth}
    {resetDisplayedMonth}
  />
  <table class="calendar">
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
          <th>W</th>
        {/if}
        {#each daysOfWeek as dayOfWeek}
          <th>{dayOfWeek}</th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each month as week (week.days[0].format())}
        <tr>
          {#if showWeekNums}
            <WeekNum
              {...week}
              weekStart={weekStartIndex}
              metadata={getWeeklyMetadata(sources, week.days[0])}
              onClick={onClickWeek}
              onContextMenu={onContextMenuWeek}
              onHover={onHoverWeek}
              {selectedId}
            />
          {/if}
          {#each week.days as date (date.format())}
            <Day
              {date}
              today={localizedToday}
              displayedMonth={localizedDisplayedMonth}
              onClick={onClickDay}
              onContextMenu={onContextMenuDay}
              onHover={onHoverDay}
              metadata={getDailyMetadata(sources, date)}
              {selectedId}
            />
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
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

  th {
    text-align: center;
  }

  .weekend {
    background-color: var(--color-background-weekend);
  }

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
    text-transform: uppercase;
  }
</style>
