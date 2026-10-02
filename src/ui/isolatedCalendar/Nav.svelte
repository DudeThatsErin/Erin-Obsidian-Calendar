<script lang="ts">
  import type { Moment } from "moment";

  import type { CalendarViewMode } from "../../settings";
  import Arrow from "./Arrow.svelte";
  import { withCalendarLocale } from "./locale";

  export let displayedMonth: Moment;
  export let today: Moment;
  export let locale: string;
  export let viewMode: CalendarViewMode = "month";

  export let resetDisplayedMonth: () => void;
  export let incrementDisplayedMonth: () => void;
  export let decrementDisplayedMonth: () => void;
  export let onToggleView: () => void;

  let localizedToday: Moment;
  let localizedDisplayedMonth: Moment;
  let todayDisplayText: string;
  let navigationUnit: string;
  let alternateView: string;
  $: localizedToday = withCalendarLocale(today, locale);
  $: localizedDisplayedMonth = withCalendarLocale(displayedMonth, locale);
  $: todayDisplayText = localizedToday.calendar().split(/\d|\s/)[0];
  $: navigationUnit = viewMode === "year" ? "year" : "month";
  $: alternateView = viewMode === "year" ? "Month" : "Year";

  let isMobile = Boolean(
    (window.app as unknown as { isMobile?: boolean }).isMobile
  );

  function resetOnKeyboard(event: KeyboardEvent): void {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      resetDisplayedMonth();
    }
  }
</script>

<div class="nav" class:is-mobile={isMobile}>
  <!-- The wrapper remains a heading so Calendar can add independent month/year actions. -->
  <!-- svelte-ignore a11y-no-noninteractive-element-to-interactive-role -->
  <h3
    class="title"
    on:click={resetDisplayedMonth}
    on:keydown={resetOnKeyboard}
    role="button"
    tabindex="0"
    aria-label={`Show current ${navigationUnit}`}
  >
    {#if viewMode === "month"}
      <span class="month">{localizedDisplayedMonth.format("MMM")}</span>
    {/if}
    <span class="year">{localizedDisplayedMonth.format("YYYY")}</span>
  </h3>
  <div class="right-nav">
    <Arrow
      direction="left"
      onClick={decrementDisplayedMonth}
      tooltip={`Previous ${navigationUnit}`}
    />
    <button class="reset-button" on:click={resetDisplayedMonth} type="button">
      {todayDisplayText}
    </button>
    <Arrow
      direction="right"
      onClick={incrementDisplayedMonth}
      tooltip={`Next ${navigationUnit}`}
    />
    <button
      class="view-toggle"
      aria-label={`Switch to ${alternateView.toLowerCase()} view`}
      aria-pressed={viewMode === "year"}
      on:click={onToggleView}
      type="button"
    >
      {alternateView}
    </button>
  </div>
</div>

<style>
  .nav {
    align-items: center;
    display: flex;
    margin: 0.6em 0 1em;
    padding: 0 8px;
    width: 100%;
  }

  .nav.is-mobile {
    padding: 0;
  }

  .title {
    color: var(--color-text-title);
    cursor: pointer;
    font-size: 1.5em;
    margin: 0;
  }

  .is-mobile .title {
    font-size: 1.3em;
  }

  .month {
    font-weight: 500;
    text-transform: capitalize;
  }

  .year {
    color: var(--interactive-accent);
  }

  .right-nav {
    display: flex;
    justify-content: center;
    margin-left: auto;
  }

  .reset-button {
    background: none;
    border: 0;
    border-radius: 4px;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 0.7em;
    font-weight: 600;
    letter-spacing: 1px;
    margin: 0 4px;
    padding: 0 4px;
    text-transform: uppercase;
  }

  .view-toggle {
    background: none;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 0.7em;
    font-weight: 600;
    letter-spacing: 0.4px;
    margin-left: 0.4em;
    padding: 0.1em 0.45em;
    text-transform: uppercase;
  }

  .view-toggle:hover {
    background: var(--interactive-hover);
  }

  .view-toggle:focus-visible {
    outline: 2px solid var(--interactive-accent);
    outline-offset: 2px;
  }

  .is-mobile .reset-button {
    display: none;
  }
</style>
