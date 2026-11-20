<script lang="ts">
  import { app } from '../app.svelte';
  import Icon from '../components/Icon.svelte';
  import IconButton from '../components/IconButton.svelte';
  import TileGrid from '../components/TileGrid.svelte';
  import { num } from '../format';
  import { offline } from '../offline.svelte';
  import { findGroup } from '../views';

  const view = $derived.by(() => {
    // Session / conversation / chain opened from the detail view (read-only).
    if (/^(s|c|ch):/.test(app.coll)) {
      const g = findGroup(app.visible, app.coll);
      const kind = app.coll.startsWith('s:') ? 'Session' : app.coll.startsWith('ch:') ? 'Chain' : 'Conversation';
      return { smart: true, name: g?.title ?? kind, kw: [] as string[], its: g?.items ?? [], sub: `${kind} · ${g?.sub ?? 'no items'}` };
    }
    const c = app.colls.find((x) => x.id === app.coll);
    const its = c ? app.collItems(c.id) : [];
    const vids = its.filter((i) => i.kind === 'video').length;
    return { smart: false, name: c?.name ?? 'Collection', kw: [] as string[], its, sub: `${its.length} items · ${vids} video${vids === 1 ? '' : 's'}` };
  });

  const offState = $derived.by(() => {
    const can = offline.eligible(view.its);
    return { can: can.length, have: can.filter((i) => offline.files[i.id]).length };
  });

  async function downloadAll() {
    if (!offState.can) return app.say('Nothing downloadable in here');
    const n = await offline.start(view.its.map((i) => i.id));
    app.say(n ? `Downloading ${n} for offline` : 'Already available offline');
  }

  let editing = $state(false);
  let draft = $state('');
  let confirmDelete = $state(false);

  function startRename() {
    if (view.smart) return;
    draft = view.name;
    editing = true;
  }
  function commitRename() {
    app.renameCollection(app.coll, draft);
    editing = false;
  }
  function save() {
    const id = app.newCollection(view.name, view.its.map((i) => i.id));
    app.coll = id;
    app.say(`Saved “${view.name}” as a collection`);
  }
  function del() {
    if (!confirmDelete) {
      confirmDelete = true;
      app.say('Tap delete again to remove this collection');
      setTimeout(() => (confirmDelete = false), 3000);
      return;
    }
    const name = view.name;
    app.deleteCollection(app.coll);
    app.say(`Deleted “${name}”`);
    app.back();
  }
  function focus(el: HTMLInputElement) {
    el.focus();
    el.select();
  }
</script>

<div class="flex min-h-0 flex-1 flex-col">
  <div class="flex h-16 flex-none items-center p-1">
    <IconButton icon="arrow_back" label="Back" color="var(--color-on-surface)" onclick={() => app.back()} />
    <div class="flex-1"></div>
    <IconButton
      icon={app.settings.layout === 'masonry' ? 'grid_view' : 'dashboard'}
      label="Switch layout"
      color="var(--color-on-surface)"
      onclick={() => (app.settings.layout = app.settings.layout === 'masonry' ? 'grid' : 'masonry')}
    />
    <IconButton
      icon={offState.can && offState.have === offState.can ? 'offline_pin' : 'download_for_offline'}
      label="Download for offline"
      color={offState.can && offState.have === offState.can ? 'var(--color-primary)' : 'var(--color-on-surface)'}
      onclick={downloadAll}
    />
    <IconButton icon="download_2" label={offline.saveLabel} color="var(--color-on-surface)" onclick={() => offline.exportItems(view.its.map((i) => i.id), view.name)} />
    <IconButton
      icon="link"
      label="Copy all Grok links"
      color="var(--color-on-surface)"
      onclick={() => app.copy(view.its.map((i) => i.grokUrl).join('\n'), `${view.its.length} Grok links copied`)}
    />
    {#if !view.smart}
      <IconButton icon="delete" label="Delete collection" color={confirmDelete ? 'var(--color-fav)' : 'var(--color-on-surface)'} onclick={del} />
    {/if}
  </div>

  <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-[calc(40px+env(safe-area-inset-bottom))]">
    <div class="flex flex-col gap-2.5 px-2 pt-1 pb-5">
      {#if view.smart}
        <div class="flex items-center gap-1.5 text-[13px] font-medium text-primary"><Icon name="auto_awesome" size={16} /><span>Smart group</span></div>
      {/if}
      {#if editing}
        <input
          bind:value={draft}
          use:focus
          onblur={commitRename}
          onkeydown={(e) => e.key === 'Enter' && commitRename()}
          class="w-full rounded-xl border-0 bg-surface-2 px-2 py-1 text-[30px] leading-[1.15] font-semibold tracking-[-0.02em] text-on-surface outline-none"
        />
      {:else}
        <button
          type="button"
          onclick={startRename}
          class="border-0 bg-transparent p-0 text-left text-[30px] leading-[1.15] font-semibold tracking-[-0.02em] text-on-surface"
          class:cursor-default={view.smart}
        >{view.name}</button>
      {/if}
      <div class="text-sm text-on-variant">
        {view.sub}{#if offState.can} · <span style:color={offState.have === offState.can ? 'var(--color-primary)' : undefined}>{num(offState.have)}/{num(offState.can)} offline</span>{/if}
      </div>
      {#if view.smart}
        <div class="flex flex-col gap-3 pt-1">
          <div class="flex flex-wrap gap-1.5">
            {#each view.kw as k (k)}
              <span class="flex h-7 items-center rounded-lg border border-outline-variant px-2.5 text-[13px] text-on-variant">{k}</span>
            {/each}
          </div>
          <button
            type="button"
            onclick={save}
            class="flex h-10 items-center gap-2 self-start rounded-[20px] border-0 bg-primary-container pr-[18px] pl-3.5 text-sm font-semibold text-on-primary-container"
          >
            <Icon name="bookmark_add" size={18} /><span>Save as collection</span>
          </button>
        </div>
      {/if}
    </div>
    {#if view.its.length}
      <TileGrid items={view.its} />
    {:else}
      <div class="px-6 py-12 text-center text-sm text-outline">Empty. Add items from the library or an asset's detail page.</div>
    {/if}
  </div>
</div>
