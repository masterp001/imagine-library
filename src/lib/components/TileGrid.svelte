<script lang="ts">
  import { app } from '../app.svelte';
  import type { Item } from '../types';
  import Tile from './Tile.svelte';

  let { items, selectable = false, seq }: { items: Item[]; selectable?: boolean; seq?: () => string[] } = $props();
  const masonry = $derived(app.settings.layout === 'masonry');
  const gap = $derived(masonry ? 8 : 3);
  let w = $state(0);
  // Column count follows the available width (phone: 2 / 3, desktop: up to 9 / 12).
  const cols = $derived(masonry ? Math.min(9, Math.max(2, Math.round(w / 250))) : Math.min(12, Math.max(3, Math.round(w / 170))));
</script>

<div bind:clientWidth={w} style:columns={cols} style:column-gap="{gap}px" style:--gap="{gap}px">
  {#each items as item (item.id)}
    <Tile {item} {selectable} seq={seq ?? (() => items.map((i) => i.id))} />
  {/each}
</div>
