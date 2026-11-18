<script lang="ts">
  import { app } from '../app.svelte';
  import Chip from '../components/Chip.svelte';
  import Icon from '../components/Icon.svelte';
  import Media from '../components/Media.svelte';
  import { parseQuery, search, type Seg } from '../search';
  import type { Scope } from '../types';

  const SCOPES: [Scope, string][] = [['all', 'All fields'], ['prompt', 'Prompt'], ['notes', 'Notes'], ['meta', 'Metadata']];
  const SUGGEST = ['mode:fun', 'kind:video', 'note:', 'ratio:9:16'];

  // Debounce the query a little so typing stays smooth on large libraries.
  let dq = $state(app.q);
  $effect(() => {
    const v = app.q;
    const t = setTimeout(() => (dq = v), 120);
    return () => clearTimeout(t);
  });

  const pq = $derived(parseQuery(dq, app.scope));
  const results = $derived(search(app.visible, app.colls, app.groupOf, pq));
  const MAX = 200;
  const recents = $derived(app.recents.length ? app.recents : SUGGEST);

  function setScope(k: Scope) {
    if (pq.field) app.q = pq.q;
    app.scope = k;
  }

  function open(id: string) {
    app.addRecent(app.q);
    app.nav('detail', { cur: id, seq: results.map((r) => r.item.id) });
  }

  let input = $state<HTMLInputElement>();
</script>

{#snippet hl(list: Seg[])}{#each list as s, i (i)}{#if s.hit}<span class="rounded bg-primary-container px-0.5 text-on-primary-container">{s.t}</span>{:else}<span>{s.t}</span>{/if}{/each}{/snippet}

<div class="flex min-h-0 flex-1 flex-col">
  <div class="flex-none px-4 pt-2 pb-1">
    <form
      class="flex h-14 items-center gap-1 rounded-[28px] bg-surface-3 pr-1.5 pl-4"
      onsubmit={(e) => {
        e.preventDefault();
        app.addRecent(app.q);
        input?.blur();
      }}
    >
      <span class="text-on-variant"><Icon name="search" size={24} /></span>
      <input
        bind:this={input}
        bind:value={app.q}
        type="search"
        enterkeyhint="search"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        placeholder="Search prompts, notes, seeds…"
        class="h-full min-w-0 flex-1 border-0 bg-transparent px-2 text-base text-on-surface outline-none select-text placeholder:text-on-variant/70 [&::-webkit-search-cancel-button]:hidden"
      />
      {#if app.q}
        <button
          type="button"
          aria-label="Clear"
          onclick={() => {
            app.q = '';
            input?.focus();
          }}
          class="state-layer flex h-11 w-11 items-center justify-center rounded-full border-0 bg-transparent text-on-variant"
        >
          <Icon name="close" size={22} />
        </button>
      {/if}
    </form>
  </div>

  <div class="flex flex-none gap-2 overflow-x-auto px-4 pt-2.5 pb-2">
    {#each SCOPES as [k, l] (k)}
      <Chip label={l} on={pq.scope === k} onclick={() => setScope(k)} />
    {/each}
  </div>

  <div class="min-h-0 flex-1 overflow-y-auto pb-[calc(110px+env(safe-area-inset-bottom))] lg:pb-12">
    {#if pq.q}
      <div class="px-5 pt-2 pb-1.5 text-[13px] text-outline">
        {results.length.toLocaleString('en-US')} result{results.length === 1 ? '' : 's'} for “{pq.q}”{pq.field ? ' in ' + pq.field : ''}
      </div>
      {#each results.slice(0, MAX) as r (r.item.id)}
        <button type="button" onclick={() => open(r.item.id)} class="state-layer flex w-full gap-3.5 border-0 bg-transparent px-4 py-2.5 text-left">
          <div class="relative h-16 w-16 flex-none overflow-hidden rounded-[14px]">
            <Media item={r.item} radius={14} />
            {#if r.item.kind === 'video'}
              <span class="absolute right-1 bottom-1 text-white"><Icon name="play_circle" size={16} fill /></span>
            {/if}
          </div>
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <div class="clamp-2 text-[15px] leading-[1.4] text-on-surface">{@render hl(r.segs)}</div>
            {#if r.noteSegs}
              <div class="truncate text-[13px] leading-[1.4] text-on-variant"><span class="text-outline">Note: </span>{@render hl(r.noteSegs)}</div>
            {/if}
            <div class="truncate font-mono text-xs text-outline">{@render hl(r.metaSegs)}</div>
          </div>
        </button>
      {/each}
      {#if results.length > MAX}
        <div class="px-5 py-3 text-center text-[13px] text-outline">Showing the first {MAX}. Refine the search to narrow it down.</div>
      {/if}
      {#if results.length === 0}
        <div class="flex flex-col items-center gap-2 px-8 py-16 text-center">
          <span class="text-outline-variant"><Icon name="search_off" size={40} /></span>
          <span class="text-base font-medium">No matches</span>
          <span class="text-sm text-outline">Try a different word or switch the field filter to All.</span>
        </div>
      {/if}
    {:else}
      <div class="px-5 pt-3 pb-1 text-sm font-medium text-on-variant">{app.recents.length ? 'Recent' : 'Try'}</div>
      {#each recents as rc (rc)}
        <button
          type="button"
          onclick={() => {
            app.q = rc;
            app.scope = 'all';
          }}
          class="state-layer flex h-[52px] w-full items-center gap-4 border-0 bg-transparent px-5 text-left text-[15px] text-on-surface"
        >
          <span class="text-outline"><Icon name="history" size={22} /></span>
          <span class:font-mono={rc.includes(':')}>{rc}</span>
        </button>
      {/each}
      <div class="px-5 pt-4 text-xs leading-normal text-outline">
        Field filters: <span class="font-mono text-on-variant">seed:</span> <span class="font-mono text-on-variant">mode:</span>
        <span class="font-mono text-on-variant">model:</span> <span class="font-mono text-on-variant">kind:</span>
        <span class="font-mono text-on-variant">ratio:</span> <span class="font-mono text-on-variant">note:</span>
        <span class="font-mono text-on-variant">prompt:</span>
      </div>
    {/if}
  </div>
</div>
