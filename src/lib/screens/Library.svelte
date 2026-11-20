<script lang="ts">
  import { app } from '../app.svelte';
  import Chip from '../components/Chip.svelte';
  import Icon from '../components/Icon.svelte';
  import IconButton from '../components/IconButton.svelte';
  import Media from '../components/Media.svelte';
  import TileGrid from '../components/TileGrid.svelte';
  import { num } from '../format';
  import type { Item } from '../types';
  import { buildGroups, mimeLabel, mimeOf, sourceOf, VIEWS, type View } from '../views';

  // ---- filters: favorites → source (generated / uploads) → MIME type ----
  const base = $derived(app.favOnly ? app.visible.filter((i) => i.fav) : app.visible);
  const bySource = $derived(app.source === 'all' ? base : base.filter((i) => sourceOf(i) === app.source));
  const filtered = $derived(app.mime === 'all' ? bySource : bySource.filter((i) => mimeOf(i) === app.mime));

  const sourceCounts = $derived.by(() => {
    let up = 0;
    for (const i of base) if (sourceOf(i) === 'upload') up++;
    return { all: base.length, generated: base.length - up, upload: up };
  });
  const mimes = $derived.by(() => {
    const m = new Map<string, number>();
    for (const i of bySource) m.set(mimeOf(i), (m.get(mimeOf(i)) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  });
  $effect(() => {
    // Drop a MIME filter that no longer has items (e.g. after switching source).
    if (app.mime !== 'all' && !mimes.some(([m]) => m === app.mime)) app.mime = 'all';
  });

  const totals = $derived.by(() => {
    let v = 0, up = 0;
    for (const i of app.visible) {
      if (i.kind === 'video') v++;
      if (sourceOf(i) === 'upload') up++;
    }
    return { all: app.visible.length, videos: v, images: app.visible.length - v, uploads: up };
  });

  // ---- view ----
  const view = $derived<View>(app.settings.view ?? 'date');
  const newest = $derived(app.settings.newestFirst ?? true);
  const allGroups = $derived(buildGroups(filtered, view, newest, app.visible));
  const hasConv = $derived(filtered.some((i) => i.conv));
  const inChains = $derived(allGroups.reduce((s, g) => s + (view === 'chain' ? g.items.length : 0), 0));

  // Render progressively so large libraries stay smooth on a phone.
  const STEP = 150;
  let limit = $state(STEP);
  $effect(() => {
    void view;
    void newest;
    void app.source;
    void app.mime;
    void app.favOnly;
    limit = STEP;
  });
  const groups = $derived.by(() => {
    const out: { key: string; title: string; sub: string; items: Item[]; total: number }[] = [];
    let shown = 0;
    for (const g of allGroups) {
      if (shown >= limit) break;
      const take = g.items.slice(0, Math.max(0, limit - shown));
      shown += take.length;
      out.push({ key: g.key, title: g.title, sub: g.sub, items: take, total: g.items.length });
    }
    return out;
  });
  const shownTotal = $derived(allGroups.reduce((s, g) => s + g.items.length, 0));

  // Swipe order in the detail view follows the current view.
  const order = $derived(allGroups.flatMap((g) => g.items.map((i) => i.id)));
  const seq = () => order;


  let sentinel = $state<HTMLDivElement>();
  $effect(() => {
    if (!sentinel) return;
    const io = new IntersectionObserver(
      (e) => {
        if (e[0].isIntersecting && limit < shownTotal) limit += STEP;
      },
      { rootMargin: '800px' }
    );
    io.observe(sentinel);
    return () => io.disconnect();
  });

  function selectAll() {
    app.selected = filtered.map((i) => i.id);
  }

  function setView(v: View) {
    app.settings.view = v;
  }
</script>

<div class="flex min-h-0 flex-1 flex-col">
  {#if !app.selecting}
    <div class="flex items-start justify-between pt-3 pr-2 pb-2 pl-5">
      <div class="flex min-w-0 flex-col gap-0.5">
        <h1 class="m-0 text-[30px] font-semibold tracking-[-0.02em]">Library</h1>
        <div class="truncate text-[13px] text-on-variant">
          {num(totals.all)} items · {num(totals.images)} images · {num(totals.videos)} videos{totals.uploads ? ` · ${num(totals.uploads)} uploads` : ''}
        </div>
      </div>
      <div class="flex flex-none">
        <IconButton
          icon="favorite"
          fill={app.favOnly}
          label={app.favOnly ? 'Show all' : 'Favorites only'}
          color={app.favOnly ? 'var(--color-fav)' : undefined}
          onclick={() => (app.favOnly = !app.favOnly)}
        />
        <IconButton
          icon="swap_vert"
          label={newest ? 'Newest first (tap for oldest first)' : 'Oldest first (tap for newest first)'}
          onclick={() => {
            app.settings.newestFirst = !newest;
            app.say(app.settings.newestFirst ? 'Newest first' : 'Oldest first');
          }}
        />
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

  <!-- view switcher -->
  <div class="flex-none px-4 pb-2.5">
    <div class="flex overflow-hidden rounded-[20px] border border-outline" role="tablist" aria-label="View">
      {#each VIEWS as [v, l], n (v)}
        <button
          type="button"
          role="tab"
          aria-selected={view === v}
          onclick={() => setView(v)}
          class="flex h-10 min-w-0 flex-1 items-center justify-center gap-1 border-0 px-1 text-[13px] font-medium"
          style:border-left={n ? '1px solid var(--color-outline)' : undefined}
          style:background={view === v ? 'var(--color-secondary-container)' : 'transparent'}
          style:color={view === v ? 'var(--color-on-secondary-container)' : 'var(--color-on-variant)'}
        >
          {#if view === v}<Icon name="check" size={16} />{/if}
          <span class="truncate">{l}</span>
        </button>
      {/each}
    </div>
  </div>

  <!-- filters: source, then MIME type -->
  <div class="flex flex-none items-center gap-2 overflow-x-auto px-4 pb-3">
    <Chip label="All · {num(sourceCounts.all)}" on={app.source === 'all'} onclick={() => (app.source = 'all')} />
    <Chip label="Generated · {num(sourceCounts.generated)}" on={app.source === 'generated'} onclick={() => (app.source = app.source === 'generated' ? 'all' : 'generated')} />
    <Chip label="Uploads · {num(sourceCounts.upload)}" on={app.source === 'upload'} onclick={() => (app.source = app.source === 'upload' ? 'all' : 'upload')} />
    <span class="mx-1 h-6 w-px flex-none bg-outline-variant"></span>
    {#each mimes as [m, c] (m)}
      <Chip label="{mimeLabel(m)} · {num(c)}" on={app.mime === m} onclick={() => (app.mime = app.mime === m ? 'all' : m)} />
    {/each}
  </div>

  <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-[calc(120px+env(safe-area-inset-bottom))] lg:pb-12">
    {#if app.items.length === 0}
      <div class="flex flex-col items-center gap-3 px-8 py-16 text-center">
        <span class="text-outline-variant"><Icon name="photo_library" size={48} /></span>
        <span class="text-base font-medium">Your library is empty</span>
        <span class="text-sm text-outline">Import your Grok Imagine export or use live sync to browse and organize your creations.</span>
        <div class="mt-2 flex gap-2">
          <button type="button" onclick={() => app.tab('sync')} class="h-10 rounded-[20px] border-0 bg-primary px-5 text-sm font-semibold text-on-primary">Import</button>
          <button type="button" onclick={() => app.loadDemo()} class="h-10 rounded-[20px] border border-outline bg-transparent px-5 text-sm font-semibold text-primary">Load demo</button>
        </div>
      </div>
    {:else}
      {#if (view === 'conversation' && !hasConv && filtered.length) || (view === 'chain' && !allGroups.length && filtered.length)}
        <div class="mx-1 mb-5 flex gap-3 rounded-3xl bg-surface-1 p-4 text-[13px] leading-normal text-on-variant">
          <span class="flex-none text-primary"><Icon name="info" size={20} /></span>
          <span>
            {view === 'conversation' ? 'No conversation ids yet.' : 'No generation chains yet.'}
            These come from Grok's asset data ({view === 'conversation' ? 'sourceConversationId' : 'inputAssets / rootAssetId'}), which the official data export doesn't include.
            Run <b class="text-on-surface">Live sync</b> in the Import tab to fetch them.
          </span>
        </div>
      {/if}
      {#if view === 'chain' && allGroups.length}
        <div class="px-1 pb-3 text-[13px] text-outline">{num(allGroups.length)} chain{allGroups.length === 1 ? '' : 's'} · {num(inChains)} items · left to right in the order they were made</div>
      {/if}

      {#each groups as grp (grp.key)}
        <section class="flex flex-col gap-2.5 pb-6">
          <div class="flex flex-col gap-0.5 px-1">
            <span class="line-clamp-2 text-base font-semibold">{grp.title}</span>
            <span class="text-[13px] text-outline">{grp.sub}</span>
          </div>
          {#if view === 'chain'}
            <!-- A chain reads left to right: input → result → result … -->
            <div class="-mx-3 flex items-center gap-1 overflow-x-auto px-3 pb-1">
              {#each grp.items as c, n (c.id)}
                {#if n > 0}<span class="flex-none text-outline"><Icon name="arrow_forward" size={18} /></span>{/if}
                <button
                  type="button"
                  onclick={() => app.nav('detail', { cur: c.id, seq: order })}
                  class="relative h-[150px] flex-none overflow-hidden rounded-[14px] border-0 bg-surface-2 p-0"
                  style:width="{Math.round((150 * Math.min(Math.max(c.w / c.h, 0.5), 1.8)))}px"
                  aria-label="Step {n + 1}: {c.prompt || c.kind}"
                >
                  <Media item={c} radius={14} />
                  <span class="absolute top-1.5 left-1.5 flex h-[22px] min-w-[22px] items-center justify-center rounded-[11px] bg-primary px-1.5 text-[11px] font-bold text-on-primary">{n + 1}</span>
                  {#if c.kind === 'video'}<span class="absolute top-1.5 right-1.5 text-white"><Icon name="play_circle" size={18} fill /></span>{/if}
                  {#if sourceOf(c) === 'upload'}
                    <span class="absolute bottom-1.5 left-1.5 rounded-md bg-[rgba(20,18,24,0.72)] px-1.5 py-0.5 text-[10px] font-semibold text-white">UPLOAD</span>
                  {/if}
                </button>
              {/each}
            </div>
          {:else}
            <TileGrid items={grp.items} selectable {seq} />
          {/if}
          {#if grp.items.length < grp.total}
            <div class="px-1 text-[13px] text-outline">… {num(grp.total - grp.items.length)} more below</div>
          {/if}
        </section>
      {:else}
        {#if !(view === 'chain' && filtered.length)}
          <div class="flex flex-col items-center gap-2 px-8 py-16 text-center">
            <span class="text-outline-variant"><Icon name="search_off" size={40} /></span>
            <span class="text-base font-medium">Nothing here</span>
            <span class="text-sm text-outline">No items match these filters.</span>
          </div>
        {/if}
      {/each}
      <div bind:this={sentinel} class="h-px"></div>
    {/if}
  </div>
</div>
