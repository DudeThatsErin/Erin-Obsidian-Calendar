<svelte:options immutable />

<script lang="ts">
  import type { Moment } from "moment";

  import { getCalendarWeekStart, getCalendarWeekUID } from "./calendarMath";
  import Dot from "./Dot.svelte";
  import MetadataResolver from "./MetadataResolver.svelte";
  import type { IDayMetadata } from "./types";

  export let weekNum: number;
  export let days: Moment[];
  export let metadata: Promise<IDayMetadata> | null;
  export let weekStart: number;

  export let onHover: (
    date: Moment,
    targetEl: EventTarget,
    isMetaPressed: boolean
  ) => boolean;
  export let onClick: (date: Moment, isMetaPressed: boolean) => boolean;
  export let onContextMenu: (date: Moment, event: MouseEvent) => boolean;
  export let selectedId: string = null;
  export let compact: boolean = false;

  let startOfWeek: Moment;
  $: startOfWeek = getCalendarWeekStart(days[0], weekStart);

  function isMetaPressed(event: MouseEvent): boolean {
    return navigator.platform.includes("Mac") ? event.metaKey : event.ctrlKey;
  }
</script>

<td>
  <MetadataResolver {metadata} let:metadata>
    <div
      class={`week-num ${metadata.classes.join(" ")}`}
      class:active={selectedId === getCalendarWeekUID(days[0], weekStart)}
      class:compact
      on:click={onClick &&
        ((event) => onClick(startOfWeek, isMetaPressed(event)))}
      on:contextmenu={onContextMenu && ((event) => onContextMenu(days[0], event))}
      on:pointerover={onHover &&
        ((event) => onHover(startOfWeek, event.target, isMetaPressed(event)))}
      {...metadata.dataAttributes}
    >
      {weekNum}
      <div class="dot-container">
        {#each metadata.dots as dot}
          <Dot
            {...dot}
            isActive={selectedId === getCalendarWeekUID(days[0], weekStart)}
          />
        {/each}
      </div>
    </div>
  </MetadataResolver>
</td>

<style>
  td {
    border-right: 1px solid var(--background-modifier-border);
  }

  .week-num {
    background-color: var(--color-background-weeknum);
    border-radius: 4px;
    color: var(--color-text-weeknum);
    cursor: pointer;
    font-size: 0.65em;
    height: 100%;
    padding: 4px;
    text-align: center;
    transition: background-color 0.1s ease-in, color 0.1s ease-in;
    vertical-align: baseline;
  }

  .week-num:hover {
    background-color: var(--interactive-hover);
  }

  .week-num.active:hover {
    background-color: var(--interactive-accent-hover);
  }

  .active {
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

  .week-num.compact {
    font-size: 0.55em;
    padding: 2px 0;
  }

  .week-num.compact .dot-container {
    line-height: 4px;
    min-height: 4px;
  }
</style>
