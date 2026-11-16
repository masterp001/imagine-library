<script lang="ts">
  import { app } from '../app.svelte';
  import type { Item } from '../types';
  import Tile from './Tile.svelte';

  let { items, selectable = false }: { items: Item[]; selectable?: boolean } = $props();
  const masonry = $derived(app.settings.layout === 'masonry');
  const gap = $derived(masonry ? 8 : 3);
</script>

<div style:columns={masonry ? 2 : 3} style:column-gap="{gap}px" style:--gap="{gap}px">
  {#each items as item (item.id)}
    <Tile {item} {selectable} />
  {/each}
</div>
