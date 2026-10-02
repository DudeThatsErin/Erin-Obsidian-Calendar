<svelte:options immutable />

<script lang="ts">
  import type { Moment } from "moment";

  import { getCalendarDayUID } from "./calendarMath";
  import Dot from "./Dot.svelte";
  import MetadataResolver from "./MetadataResolver.svelte";
  import type { IDayMetadata } from "./types";

  export let date: Moment;
  export let metadata: Promise<IDayMetadata> | null;
  export let onHover: (
    date: Moment,
    targetEl: EventTarget,
    isMetaPressed: boolean
  ) => boolean;
  export let onClick: (date: Moment, isMetaPressed: boolean) => boolean;
  export let onContextMenu: (date: Moment, event: MouseEvent) => boolean;

  export let today: Moment;
  export let displayedMonth: Moment = null;
  export let selectedId: string = null;
  export let compact: boolean = false;

  function isMetaPressed(event: MouseEvent): boolean {
    return navigator.platform.includes("Mac") ? event.metaKey : event.ctrlKey;
  }
</script>

<td>
  <MetadataResolver {metadata} let:metadata>
    <div
      class={`day ${metadata.classes.join(" ")}`}
      class:active={selectedId === getCalendarDayUID(date)}
      class:adjacent-month={!date.isSame(displayedMonth, "month")}
      class:today={date.isSame(today, "day")}
      class:compact
      aria-current={date.isSame(today, "day") ? "date" : undefined}
      aria-label={date.format("LL")}
      on:click={onClick && ((event) => onClick(date, isMetaPressed(event)))}
      on:contextmenu={onContextMenu && ((event) => onContextMenu(date, event))}
      on:pointerover={onHover &&
        ((event) => onHover(date, event.target, isMetaPressed(event)))}
      {...metadata.dataAttributes}
    >
      {date.format("D")}
      <div class="dot-container">
        {#each metadata.dots as dot}
          <Dot {...dot} isActive={selectedId === getCalendarDayUID(date)} />
        {/each}
      </div>
    </div>
  </MetadataResolver>
</td>

<style>
  .day {
    background-color: var(--color-background-day);
    border-radius: 4px;
    color: var(--color-text-day);
    cursor: pointer;
    font-size: 0.8em;
    height: 100%;
    padding: 4px;
    position: relative;
    text-align: center;
    transition: background-color 0.1s ease-in, color 0.1s ease-in;
    vertical-align: baseline;
  }

  .day:hover {
    background-color: var(--interactive-hover);
  }

  .day.active:hover {
    background-color: var(--interactive-accent-hover);
  }

  .adjacent-month {
    opacity: 0.25;
  }

  .today {
    color: var(--color-text-today);
  }

  .day:active,
  .active,
  .active.today {
    background-color: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  .dot-container {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    line-height: 6px;
    min-height: 6px;
  }

  .day.compact {
    font-size: 0.7em;
    min-height: 1.6em;
    padding: 2px 0;
  }

  .day.compact .dot-container {
    line-height: 4px;
    min-height: 4px;
  }
</style>
