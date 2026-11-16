<script lang="ts">
  import { app } from '../app.svelte';
  import Chip from '../components/Chip.svelte';
  import Icon from '../components/Icon.svelte';
  import IconButton from '../components/IconButton.svelte';
  import Media from '../components/Media.svelte';
  import TileGrid from '../components/TileGrid.svelte';
  import { ago, dayKey, dayLabel, EMPTY_STRIPE, num } from '../format';
  import type { Filter, Item } from '../types';

  const FILTERS: [Filter, string][] = [['all', 'All'], ['images', 'Images'], ['videos', 'Videos'], ['favorites', 'Favorites'], ['chains', 'Chains']];

  const pass = (i: Item) =>
    app.filter === 'all' ||
    (app.filter === 'images' && i.kind === 'image') ||
    (app.filter === 'videos' && i.kind === 'video') ||
    (app.filter === 'favorites' && i.fav) ||
    (app.filter === 'chains' && (!!i.parent || app.parents.has(i.id)));

  const filtered = $derived(app.visible.filter(pass));

  // Render progressively so large libraries stay smooth on a phone.
  const STEP = 120;
  let limit = $state(STEP);
  $effect(() => {
    void app.filter;
    limit = STEP;
  });

  const groups = $derived.by(() => {
    const out: { key: number; label: string; count: number; tiles: Item[] }[] = [];
    let shown = 0;
    const sorted = [...filtered].sort((a, b) => b.createdAt - a.createdAt);
    for (const it of sorted) {
      const k = dayKey(it.createdAt);
      let g = out.at(-1);
      if (!g || g.key !== k) {
        g = { key: k, label: dayLabel(it.createdAt), count: 0, tiles: [] };
        out.push(g);
      }
      g.count++;
      if (shown < limit) {
        g.tiles.push(it);
        shown++;
      }
    }
    return out.filter((g) => g.tiles.length);
  });

  const smart = $derived(
    app.groups.map((g) => {
      const first = app.byId.get(g.ids[0]);
      return { ...g, first };
    })
  );
  const showStrip = $derived(app.settings.showSmartStrip && !app.selecting && app.filter === 'all' && smart.length > 0);

  let sentinel = $state<HTMLDivElement>();
  $effect(() => {
    if (!sentinel) return;
    const io = new IntersectionObserver(
      (e) => {
        if (e[0].isIntersecting && limit < filtered.length) limit += STEP;
      },
      { rootMargin: '800px' }
    );
    io.observe(sentinel);
    return () => io.disconnect();
  });

  function selectAll() {
    app.selected = filtered.map((i) => i.id);
  }
</script>

<div class="flex min-h-0 flex-1 flex-col">
  {#if !app.selecting}
    <div class="flex items-start justify-between pt-3 pr-2 pb-2 pl-5">
      <div class="flex flex-col gap-0.5">
        <h1 class="m-0 text-[30px] font-semibold tracking-[-0.02em]">Library</h1>
        <div class="text-[13px] text-on-variant">
          {num(app.visible.length)} generations · {app.demo ? 'demo library' : `imported ${ago(app.lastImport)}`}
        </div>
      </div>
      <div class="flex">
        <IconButton
          icon={app.settings.layout === 'masonry' ? 'grid_view' : 'dashboard'}
          label="Switch layout"
          onclick={() => (app.settings.layout = app.settings.layout === 'masonry' ? 'grid' : 'masonry')}
        />
        <IconButton icon="checklist" label="Select" onclick={() => app.startSelect()} />
      </div>
    </div>
  {:else}
    <div class="mb-1.5 flex min-h-16 items-center gap-1 bg-surface-2 py-2 pr-2 pl-1">
      <IconButton icon="close" label="Cancel selection" color="var(--color-on-surface)" onclick={() => app.back()} />
      <div class="flex-1 text-xl font-medium">{app.selected.length} selected</div>
      <button type="button" onclick={selectAll} class="state-layer h-10 rounded-[20px] border-0 bg-transparent px-3.5 text-sm font-medium text-primary">
        Select all
      </button>
    </div>
  {/if}

  <div class="flex flex-none gap-2 overflow-x-auto px-4 pt-1 pb-3">
    {#each FILTERS as [k, l] (k)}
      <Chip label={l} on={app.filter === k} onclick={() => (app.filter = k)} />
    {/each}
  </div>

  <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-[calc(120px+env(safe-area-inset-bottom))]">
    {#if app.items.length === 0}
      <div class="flex flex-col items-center gap-3 px-8 py-16 text-center">
        <span class="text-outline-variant"><Icon name="photo_library" size={48} /></span>
        <span class="text-base font-medium">Your library is empty</span>
        <span class="text-sm text-outline">Import your Grok Imagine export to browse, search and group your generations.</span>
        <div class="mt-2 flex gap-2">
          <button type="button" onclick={() => app.tab('sync')} class="h-10 rounded-[20px] border-0 bg-primary px-5 text-sm font-semibold text-on-primary">Import export</button>
          <button type="button" onclick={() => app.loadDemo()} class="h-10 rounded-[20px] border border-outline bg-transparent px-5 text-sm font-semibold text-primary">Load demo</button>
        </div>
      </div>
    {:else}
      {#if showStrip}
        <div class="flex flex-col gap-2.5 px-1 pt-1 pb-5">
          <div class="flex items-center gap-1.5 text-sm font-medium text-on-variant">
            <span class="text-primary"><Icon name="auto_awesome" size={18} /></span>
            <span>Smart groups</span>
          </div>
          <div class="-mx-4 flex gap-2.5 overflow-x-auto px-4">
            {#each smart as g (g.id)}
              <button
                type="button"
                onclick={() => app.nav('collection', { coll: g.id })}
                class="flex w-[132px] flex-none flex-col gap-2 rounded-[20px] border-0 bg-surface-2 px-1.5 pt-1.5 pb-2.5 text-left text-on-surface"
              >
                <div class="relative h-[72px] overflow-hidden rounded-[14px]" style:background={EMPTY_STRIPE}>
                  {#if g.first}<Media item={g.first} radius={14} />{/if}
                </div>
                <div class="flex flex-col gap-px px-1.5">
                  <span class="truncate text-[13px] font-medium">{g.name}</span>
                  <span class="text-xs text-outline">{g.ids.length} items</span>
                </div>
              </button>
            {/each}
          </div>
        </div>
      {/if}

      {#each groups as grp (grp.key)}
        <section class="flex flex-col gap-2.5 pb-5">
          <div class="flex items-baseline gap-2 px-1">
            <span class="text-base font-semibold">{grp.label}</span>
            <span class="text-[13px] text-outline">{grp.count}</span>
          </div>
          <TileGrid items={grp.tiles} selectable />
        </section>
      {:else}
        <div class="flex flex-col items-center gap-2 px-8 py-16 text-center">
          <span class="text-outline-variant"><Icon name="search_off" size={40} /></span>
          <span class="text-base font-medium">Nothing here</span>
          <span class="text-sm text-outline">No generations match this filter.</span>
        </div>
      {/each}
      <div bind:this={sentinel} class="h-px"></div>
    {/if}
  </div>
</div>
