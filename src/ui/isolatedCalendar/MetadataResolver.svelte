<script lang="ts">
  import type { IDayMetadata } from "./types";

  export let metadata: Promise<IDayMetadata> | null;
</script>

{#if metadata}
  {#await metadata then resolvedMetadata}
    <slot metadata={resolvedMetadata} />
  {:catch}
    <slot metadata={{ classes: [], dots: [], dataAttributes: {} }} />
  {/await}
{:else}
  <slot metadata={{ classes: [], dots: [], dataAttributes: {} }} />
{/if}
