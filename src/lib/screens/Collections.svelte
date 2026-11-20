<script lang="ts">
  import { app } from '../app.svelte';
  import Icon from '../components/Icon.svelte';
  import Media from '../components/Media.svelte';
  import { EMPTY_STRIPE } from '../format';

  const mine = $derived(app.colls.map((c) => ({ ...c, its: app.collItems(c.id) })));

  function create() {
    const name = `Collection ${app.colls.length + 1}`;
    const id = app.newCollection(name);
    app.say(`Created “${name}” · tap its title to rename`);
    app.nav('collection', { coll: id });
  }
</script>

<div class="relative flex min-h-0 flex-1 flex-col">
  <div class="flex-none px-5 py-3">
    <h1 class="m-0 text-[30px] font-semibold tracking-[-0.02em]">Collections</h1>
  </div>
  <div class="flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto px-4 pb-[calc(190px+env(safe-area-inset-bottom))] lg:pb-12">
    <div class="flex flex-col gap-3">
      <span class="text-sm font-medium text-on-variant">Yours</span>
      {#if mine.length}
        <div class="grid grid-cols-2 gap-3">
          {#each mine as c (c.id)}
            <button
              type="button"
              onclick={() => app.nav('collection', { coll: c.id })}
              class="flex flex-col gap-2.5 rounded-3xl border-0 bg-surface-2 px-2 pt-2 pb-3 text-left text-on-surface"
            >
              <div class="grid aspect-square grid-cols-2 gap-[3px] overflow-hidden rounded-2xl">
                {#each [0, 1, 2, 3] as n (n)}
                  <div class="relative" style:background={EMPTY_STRIPE}>
                    {#if c.its[n]}<Media item={c.its[n]} />{/if}
                  </div>
                {/each}
              </div>
              <div class="flex flex-col gap-0.5 px-1.5">
                <span class="truncate text-[15px] font-medium">{c.name}</span>
                <span class="text-[13px] text-outline">{c.its.length} items</span>
              </div>
            </button>
          {/each}
        </div>
      {:else}
        <div class="rounded-3xl bg-surface-1 px-5 py-6 text-sm text-outline">
          No collections yet. Long-press tiles in the library to select them, then tap <b class="text-on-variant">Group</b>.
        </div>
      {/if}
    </div>

  </div>

  <button
    type="button"
    onclick={create}
    class="absolute right-4 bottom-[calc(100px+env(safe-area-inset-bottom))] lg:right-8 lg:bottom-8 flex h-14 items-center gap-2.5 rounded-2xl border-0 bg-primary-container pr-5 pl-4 text-[15px] font-semibold text-on-primary-container shadow-[0_6px_16px_rgba(0,0,0,0.35)]"
  >
    <Icon name="add" size={24} />
    <span>New collection</span>
  </button>
</div>
