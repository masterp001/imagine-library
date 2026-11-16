<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from './lib/app.svelte';
  import Icon from './lib/components/Icon.svelte';
  import Media from './lib/components/Media.svelte';
  import Sheet from './lib/components/Sheet.svelte';
  import { EMPTY_STRIPE } from './lib/format';
  import type { IconName } from './lib/icons';
  import Collections from './lib/screens/Collections.svelte';
  import CollectionView from './lib/screens/CollectionView.svelte';
  import Detail from './lib/screens/Detail.svelte';
  import Library from './lib/screens/Library.svelte';
  import Offline from './lib/screens/Offline.svelte';
  import { offline } from './lib/offline.svelte';
  import Search from './lib/screens/Search.svelte';
  import Sync from './lib/screens/Sync.svelte';
  import type { Screen } from './lib/types';

  onMount(async () => {
    await app.init();
    await offline.init();
    if (offline.settings.auto) offline.start();
  });

  // Persist any change (debounced inside scheduleSave).
  $effect(() => {
    app.scheduleSave();
  });

  const TABS: [Screen, string, IconName][] = [
    ['library', 'Library', 'photo_library'],
    ['search', 'Search', 'search'],
    ['collections', 'Collections', 'collections_bookmark'],
    ['offline', 'Offline', 'download_for_offline'],
    ['sync', 'Import', 'sync']
  ];

  const selectBar = $derived(app.selecting && app.screen === 'library');
  const showNav = $derived(!selectBar && ['library', 'search', 'collections', 'offline', 'sync'].includes(app.screen));
  const sel = $derived(app.selected);

  function groupSelection() {
    if (!sel.length) return app.say('Select items first');
    const name = `Group ${app.colls.length + 1}`;
    const ids = [...sel];
    const id = app.newCollection(name, ids);
    app.sheet = false;
    app.selecting = false;
    app.selected = [];
    app.nav('collection', { coll: id });
    app.say(`Created “${name}” with ${ids.length} items`);
  }

  const bulk: { icon: IconName; label: string; run: () => void }[] = [
    { icon: 'library_add', label: 'Add to', run: () => (sel.length ? app.openSheet() : app.say('Select items first')) },
    { icon: 'create_new_folder', label: 'Group', run: groupSelection },
    {
      icon: 'favorite',
      label: 'Favorite',
      run: () => {
        if (!sel.length) return app.say('Select items first');
        app.patch(sel, () => ({ fav: true }));
        app.say(`${sel.length} added to favorites`);
      }
    },
    {
      icon: 'download_2',
      label: 'Save',
      run: () => {
        if (!sel.length) return app.say('Select items first');
        offline.exportItems([...sel], 'Selection');
      }
    },
    {
      icon: 'link',
      label: 'Links',
      run: () => {
        if (!sel.length) return app.say('Select items first');
        app.copy(sel.map((id) => app.byId.get(id)?.grokUrl).filter(Boolean).join('\n'), `${sel.length} Grok links copied`);
      }
    }
  ];

  const sheetColls = $derived(
    app.colls.map((c) => {
      const its = app.collItems(c.id);
      const all = sel.length > 0 && sel.every((id) => app.byId.get(id)?.colls.includes(c.id));
      return { ...c, count: its.length, first: its[0], all };
    })
  );

  function toggleColl(id: string, name: string, all: boolean) {
    app.patch(sel, (i) => ({ colls: all ? i.colls.filter((x) => x !== id) : [...new Set([...i.colls, id])] }));
    app.say(all ? `Removed from ${name}` : `Added ${sel.length} to ${name}`);
  }

  let pasteText = $state('');
  async function doPaste() {
    const t = pasteText;
    if (!t.trim()) return app.say('Paste the export JSON first');
    app.back();
    pasteText = '';
    await app.importText(t, 'Pasted text');
    if (offline.settings.auto) offline.start();
  }

  const toastBottom = $derived(app.screen === 'detail' || app.screen === 'collection' ? 32 : 116);
</script>

<div class="relative mx-auto flex h-dvh max-w-[520px] flex-col overflow-hidden bg-surface pt-safe select-none sm:shadow-[0_0_0_1px_#2a2830]">
  {#if !app.ready}
    <div class="flex flex-1 items-center justify-center text-outline">Loading…</div>
  {:else if app.screen === 'library'}
    <Library />
  {:else if app.screen === 'detail'}
    <Detail />
  {:else if app.screen === 'search'}
    <Search />
  {:else if app.screen === 'collections'}
    <Collections />
  {:else if app.screen === 'collection'}
    <CollectionView />
  {:else if app.screen === 'offline'}
    <Offline />
  {:else if app.screen === 'sync'}
    <Sync />
  {/if}

  {#if showNav}
    <nav class="absolute right-0 bottom-0 left-0 z-5 flex bg-surface-2 px-2 pt-3 pb-[max(env(safe-area-inset-bottom),16px)]">
      {#each TABS as [k, l, ic] (k)}
        {@const on = app.screen === k}
        <button
          type="button"
          onclick={() => app.tab(k)}
          aria-current={on ? 'page' : undefined}
          class="flex flex-1 flex-col items-center gap-1 border-0 bg-transparent"
          style:color={on ? 'var(--color-on-surface)' : 'var(--color-on-variant)'}
        >
          <span
            class="state-layer relative flex h-8 w-16 items-center justify-center rounded-2xl transition-colors duration-150"
            style:background={on ? 'var(--color-primary-container)' : 'transparent'}
          >
            <Icon name={ic} size={24} fill={on} />
            {#if k === 'offline' && offline.running && !offline.paused}
              <span class="absolute top-0.5 right-3.5 h-2 w-2 rounded-full bg-primary animate-pulse"></span>
            {/if}
          </span>
          <span class="text-xs" style:font-weight={on ? 600 : 500}>{l}</span>
        </button>
      {/each}
    </nav>
  {/if}

  {#if selectBar}
    <div class="absolute right-0 bottom-0 left-0 z-5 flex bg-surface-2 px-2 pt-2.5 pb-[max(env(safe-area-inset-bottom),20px)] [animation:sheet-up_180ms_ease-out]">
      {#each bulk as b (b.label)}
        <button type="button" onclick={b.run} class="flex flex-1 flex-col items-center gap-1.5 border-0 bg-transparent pt-1 text-on-surface">
          <Icon name={b.icon} size={24} />
          <span class="text-xs font-medium">{b.label}</span>
        </button>
      {/each}
    </div>
  {/if}

  {#if app.sheet}
    <Sheet onclose={() => app.back()}>
      <div class="px-6 pb-3 text-xl font-semibold">{sel.length === 1 ? 'Add to collection' : `Add ${sel.length} to collection`}</div>
      {#each sheetColls as c (c.id)}
        <button
          type="button"
          onclick={() => toggleColl(c.id, c.name, c.all)}
          class="state-layer flex items-center gap-3.5 border-0 bg-transparent px-6 py-2 text-left text-on-surface"
        >
          <div class="relative h-11 w-11 flex-none overflow-hidden rounded-xl" style:background={EMPTY_STRIPE}>
            {#if c.first}<Media item={c.first} radius={12} />{/if}
          </div>
          <div class="flex flex-1 flex-col gap-0.5">
            <span class="text-[15px] font-medium">{c.name}</span>
            <span class="text-[13px] text-outline">{c.count} items</span>
          </div>
          <span style:color={c.all ? 'var(--color-primary)' : 'var(--color-outline)'}>
            <Icon name={c.all ? 'check_box' : 'check_box_outline_blank'} size={24} fill={c.all} />
          </span>
        </button>
      {/each}
      <div class="mx-6 my-2.5 h-px bg-outline-variant"></div>
      <button
        type="button"
        onclick={groupSelection}
        class="flex items-center gap-3.5 border-0 bg-transparent px-6 py-2.5 text-[15px] font-semibold text-primary"
      >
        <span class="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-container text-on-primary-container"><Icon name="add" size={24} /></span>
        <span>New collection from selection</span>
      </button>
    </Sheet>
  {/if}

  {#if app.pasteOpen}
    <Sheet onclose={() => app.back()}>
      <div class="px-6 pb-1 text-xl font-semibold">Paste export JSON</div>
      <div class="px-6 pb-3 text-sm text-outline">Long-press the field and choose Paste.</div>
      <div class="px-6">
        <textarea
          bind:value={pasteText}
          rows="8"
          placeholder={'{ "conversations": [ … ] }'}
          class="w-full resize-none rounded-2xl border-0 bg-surface-3 px-4 py-3 font-mono text-[13px] leading-normal text-on-surface outline-none select-text placeholder:text-outline"
        ></textarea>
      </div>
      <div class="flex gap-2 px-6 pt-3">
        <button type="button" onclick={() => app.back()} class="h-11 flex-1 rounded-[22px] border border-outline bg-transparent text-sm font-semibold text-primary">Cancel</button>
        <button type="button" onclick={doPaste} class="h-11 flex-1 rounded-[22px] border-0 bg-primary text-sm font-semibold text-on-primary">Import</button>
      </div>
    </Sheet>
  {/if}

  {#if app.toast}
    <div
      role="status"
      class="absolute right-4 left-4 z-20 rounded-lg bg-inverse-surface px-4 py-3.5 text-sm text-inverse-on-surface shadow-[0_4px_12px_rgba(0,0,0,0.3)] [animation:toast-in_160ms_ease-out]"
      style:bottom="calc({toastBottom}px + env(safe-area-inset-bottom))"
    >
      {app.toast}
    </div>
  {/if}
</div>
