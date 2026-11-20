<script lang="ts">
  import { app } from '../app.svelte';
  import Icon from '../components/Icon.svelte';
  import IconButton from '../components/IconButton.svelte';
  import Media from '../components/Media.svelte';
  import { dateTime } from '../format';
  import { ORIGIN_LABEL } from '../grouping';
  import { fmtBytes, offline } from '../offline.svelte';
  import type { Item } from '../types';

  const it = $derived<Item | undefined>(app.byId.get(app.cur) ?? app.items[0]);
  /** Walk up to the first item (image → video → extension …), then list all descendants by time. */
  const root = $derived.by(() => {
    let cur = it;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      const p = app.parentOf(cur);
      const up = p ? app.byId.get(p) : undefined;
      if (!up) break;
      cur = up;
    }
    return cur;
  });
  const chain = $derived.by(() => {
    if (!root) return [];
    const out = [root], seen = new Set([root.id]);
    for (let i = 0; i < out.length && out.length < 40; i++)
      for (const c of app.grouping.children.get(out[i].id) ?? []) if (!seen.has(c.id)) (seen.add(c.id), out.push(c));
    return [root, ...out.slice(1).sort((a, b) => a.createdAt - b.createdAt)];
  });
  /** At least one link in this chain is a time-based guess, not data from Grok. */
  const chainGuessed = $derived(chain.some((c) => app.grouping.inferred.has(c.id)));
  const batchKey = $derived(it ? app.grouping.batchOf.get(it.id) : undefined);
  const variants = $derived(it && batchKey ? (app.grouping.batches.get(batchKey) ?? []).filter((x) => x.id !== it.id) : []);
  const origin = $derived(it ? app.grouping.origin.get(it.id) : undefined);
  const itColls = $derived(it ? app.colls.filter((c) => it.colls.includes(c.id)) : []);
  const grokId = $derived(it ? (it.grokUrl.split('/').pop() ?? it.id) : '');

  let scroller = $state<HTMLDivElement>();
  let info = $state<HTMLDivElement>();
  $effect(() => {
    void app.cur;
    scroller?.scrollTo({ top: 0 });
    info?.scrollTo({ top: 0 });
  });

  function setCur(id: string) {
    app.cur = id;
  }

  // ---------- horizontal swipe through the list this was opened from ----------
  const order = $derived(it && app.seq.includes(it.id) ? app.seq : app.visible.map((i) => i.id));
  const idx = $derived(it ? order.indexOf(it.id) : -1);
  const prev = $derived(idx > 0 ? app.byId.get(order[idx - 1]) : undefined);
  const next = $derived(idx >= 0 && idx < order.length - 1 ? app.byId.get(order[idx + 1]) : undefined);
  const slots = $derived([prev, it, next]);

  let width = $state(0);
  let dx = $state(0);
  let anim = $state(false);
  let pending = 0;
  let drag: { x: number; y: number; t: number; id: number; on: boolean } | null = null;
  let suppressClick = false;

  function go(dir: -1 | 1) {
    // dir -1 = next (content moves left), +1 = previous
    if (anim || !(dir < 0 ? next : prev)) return;
    pending = dir;
    anim = true;
    dx = dir * width;
  }

  function settle() {
    if (pending) {
      const target = pending < 0 ? next : prev;
      pending = 0;
      anim = false;
      dx = 0;
      if (target) app.cur = target.id;
    } else {
      anim = false;
    }
  }

  function pdown(e: PointerEvent) {
    if (anim || e.button > 0 || !e.isPrimary) return;
    const el = e.target as HTMLElement;
    // Leave the video's own control bar alone.
    if (el.tagName === 'VIDEO' && e.clientY > el.getBoundingClientRect().bottom - 64) return;
    drag = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, on: false };
  }

  function pmove(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.id) return;
    const mx = e.clientX - drag.x, my = e.clientY - drag.y;
    if (!drag.on) {
      if (Math.abs(mx) > 8 && Math.abs(mx) > Math.abs(my) * 1.2) {
        drag.on = true;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } else if (Math.abs(my) > 10) {
        drag = null;
        return;
      } else return;
    }
    const edge = (mx < 0 && !next) || (mx > 0 && !prev);
    dx = edge ? mx * 0.25 : mx;
  }

  function pup(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (!d.on) return;
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 50);
    const v = dx / Math.max(1, performance.now() - d.t);
    const far = Math.abs(dx) > width * 0.22 || Math.abs(v) > 0.45;
    if (far && dx < 0 && next) go(-1);
    else if (far && dx > 0 && prev) go(1);
    else if (dx !== 0) {
      anim = true;
      dx = 0;
    }
  }

  function key(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea, [contenteditable]') || app.sheet) return;
    if (e.key === 'ArrowRight') go(-1);
    else if (e.key === 'ArrowLeft') go(1);
  }
</script>

<svelte:window onkeydown={key} />

{#snippet stage(item: Item, main: boolean)}
  <div
    class="relative flex max-h-full items-center justify-center"
    style:aspect-ratio="{item.w}/{item.h}"
    style:width="min(100cqw, calc(100cqh * {item.w} / {item.h}))"
  >
    <Media {item} full={main} />
    {#if item.kind === 'video' && (!item.mediaUrl || !main)}
      <span class="relative flex h-16 w-16 items-center justify-center rounded-full bg-[rgba(20,18,24,0.6)] text-white">
        <Icon name="play_arrow" size={36} fill />
      </span>
    {/if}
    {#if !item.mediaUrl || (!app.settings.loadMedia && !offline.files[item.id])}
      <span class="absolute bottom-2.5 left-3 font-mono text-[11px] text-white/75">
        {item.kind} · {item.w}:{item.h}{item.dur ? ' · ' + item.dur : ''}
      </span>
    {/if}
  </div>
{/snippet}

{#if it}
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="flex h-16 flex-none items-center p-1">
      <IconButton icon="arrow_back" label="Back" color="var(--color-on-surface)" onclick={() => app.back()} />
      <div class="flex-1 text-center font-mono text-[12px] text-outline">{idx >= 0 && order.length > 1 ? `${(idx + 1).toLocaleString('en-US')} / ${order.length.toLocaleString('en-US')}` : ''}</div>
      <IconButton
        icon="favorite"
        label={it.fav ? 'Remove favorite' : 'Favorite'}
        fill={it.fav}
        color={it.fav ? 'var(--color-fav)' : 'var(--color-on-surface)'}
        onclick={() => (it.fav = !it.fav)}
      />
      <IconButton icon="link" label="Copy link" color="var(--color-on-surface)" onclick={() => app.copy(it.grokUrl, 'Grok link copied')} />
      <IconButton icon="share" label="Share" color="var(--color-on-surface)" onclick={() => app.share(it.grokUrl)} />
    </div>

    <div bind:this={scroller} class="min-h-0 flex-1 overflow-y-auto pb-[calc(40px+env(safe-area-inset-bottom))] lg:flex lg:overflow-hidden lg:pb-0">
      <div
        class="relative h-[400px] flex-none touch-pan-y overflow-hidden bg-surface-dim select-none lg:h-auto lg:min-w-0 lg:flex-1 lg:self-stretch"
        bind:clientWidth={width}
        onpointerdown={pdown}
        onpointermove={pmove}
        onpointerup={pup}
        onpointercancel={pup}
        onclickcapture={(e) => suppressClick && (e.stopPropagation(), e.preventDefault())}
        role="region"
        aria-label="Swipe left or right for the next or previous item"
      >
        <div
          class="flex h-full w-full"
          style:transform="translate3d(calc(-100% + {dx}px), 0, 0)"
          style:transition={anim ? 'transform 260ms cubic-bezier(0.2, 0, 0, 1)' : 'none'}
          ontransitionend={(e) => e.target === e.currentTarget && e.propertyName === 'transform' && settle()}
        >
          {#each slots as s, i (s?.id ?? 'empty-' + i)}
            <div class="flex h-full w-full flex-none items-center justify-center [container-type:size]" aria-hidden={i !== 1}>
              {#if s}{@render stage(s, i === 1)}{/if}
            </div>
          {/each}
        </div>
        {#if prev}
          <button
            type="button"
            aria-label="Previous"
            onclick={() => go(1)}
            class="absolute top-1/2 left-2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border-0 bg-[rgba(20,18,24,0.55)] text-white pointer-fine:flex"
          ><Icon name="chevron_left" size={26} /></button>
        {/if}
        {#if next}
          <button
            type="button"
            aria-label="Next"
            onclick={() => go(-1)}
            class="absolute top-1/2 right-2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border-0 bg-[rgba(20,18,24,0.55)] text-white pointer-fine:flex"
          ><Icon name="chevron_right" size={26} /></button>
        {/if}
      </div>

      <div bind:this={info} class="flex flex-col gap-6 px-4 pt-4 lg:w-[440px] lg:flex-none lg:overflow-y-auto lg:px-6 lg:pb-10">
        <div class="flex flex-col gap-3">
          <div class="flex flex-wrap items-center gap-2">
            <span class="flex h-7 items-center gap-1 rounded-lg bg-secondary-container px-2.5 text-[13px] font-medium text-on-secondary-container">
              <Icon name={it.kind === 'video' ? 'movie' : 'image'} size={16} />
              <span>{it.kind === 'video' ? 'Video' : 'Image'}</span>
            </span>
            {#if origin && origin !== 'text-image'}
              <span class="flex h-7 items-center rounded-lg border border-outline-variant px-2.5 text-[13px] text-on-variant">
                {ORIGIN_LABEL[origin]}{app.grouping.inferred.has(it.id) ? ' · likely' : ''}
              </span>
            {/if}
            {#if it.mode}
              <span class="flex h-7 items-center rounded-lg border border-outline-variant px-2.5 text-[13px] text-on-variant">{it.mode}</span>
            {/if}
            <span class="text-[13px] text-outline">{dateTime(it.createdAt)}</span>
          </div>
          <div class="text-[19px] leading-[1.45] font-normal text-pretty select-text">{it.prompt || 'No prompt recorded'}</div>
        </div>

        <div class="flex gap-2">
          <a
            href={it.grokUrl}
            target="_blank"
            rel="noopener"
            class="flex h-12 flex-1 items-center justify-center gap-2 rounded-3xl bg-primary text-[15px] font-semibold text-on-primary! hover:text-on-primary!"
          >
            <Icon name="open_in_new" size={20} />
            <span>Open in Grok</span>
          </a>
          <a
            href={it.grokUrl}
            target="_blank"
            rel="noopener"
            onclick={() => app.copy(it.prompt, 'Prompt copied · opening Grok to remix')}
            class="flex h-12 flex-1 items-center justify-center gap-2 rounded-3xl bg-primary-container text-[15px] font-semibold text-on-primary-container! hover:text-on-primary-container!"
          >
            <Icon name="auto_fix" size={20} />
            <span>Remix in Grok</span>
          </a>
        </div>

        {#if it.mediaUrl}
          {@const lf = offline.files[it.id]}
          {@const busy = !!offline.active[it.id]}
          <div class="flex items-center gap-3 rounded-[20px] bg-surface-1 py-2 pr-2 pl-4">
            <span style:color={lf ? 'var(--color-primary)' : 'var(--color-outline)'}><Icon name={lf ? 'offline_pin' : 'cloud_off'} size={22} fill={!!lf} /></span>
            <div class="flex min-w-0 flex-1 flex-col">
              <span class="text-sm">{lf ? 'Available offline' : busy ? 'Downloading…' : 'Not downloaded'}</span>
              <span class="truncate text-xs text-outline">
                {lf ? `${fmtBytes(lf.bytes)} · ${lf.ext.toUpperCase()}` : (offline.errors[it.id] ?? 'Stored on assets.grok.com')}
              </span>
            </div>
            {#if lf}
              <button type="button" onclick={() => offline.exportItems([it.id], 'Saved')} disabled={offline.exporting} class="flex h-10 items-center gap-1.5 rounded-[20px] border-0 bg-secondary-container px-3.5 text-[13px] font-semibold text-on-secondary-container disabled:opacity-60">
                <Icon name="download_2" size={18} /><span>{offline.saveLabel}</span>
              </button>
            {:else}
              <button type="button" disabled={busy} onclick={() => offline.start([it.id])} class="flex h-10 items-center gap-1.5 rounded-[20px] border-0 bg-secondary-container px-3.5 text-[13px] font-semibold text-on-secondary-container disabled:opacity-60">
                <Icon name="download_for_offline" size={18} /><span>Download</span>
              </button>
            {/if}
          </div>
        {/if}

        <div class="flex items-center justify-between">
          <span class="text-sm text-on-variant">Rating</span>
          <div class="flex">
            {#each [1, 2, 3, 4, 5] as n (n)}
              <button
                type="button"
                aria-label="{n} star{n > 1 ? 's' : ''}"
                onclick={() => (it.rating = it.rating === n ? 0 : n)}
                class="flex h-10 w-10 items-center justify-center border-0 bg-transparent"
                style:color={n <= it.rating ? 'var(--color-primary)' : 'var(--color-outline-variant)'}
              >
                <Icon name="star" size={26} fill={n <= it.rating} />
              </button>
            {/each}
          </div>
        </div>

        {#if chain.length > 1}
          <div class="flex flex-col gap-3">
            <div class="flex items-baseline justify-between">
              <span class="text-base font-semibold">{chain.some((c, n) => n > 0 && c.kind === 'video' && app.grouping.origin.get(c.id) === 'extend') ? 'Video chain' : 'Image → video chain'}</span>
              <span class="text-[13px] text-outline">{chain.length} steps</span>
            </div>
            {#if chainGuessed}
              <span class="-mt-1.5 text-xs leading-normal text-outline">
                Links shown as ⋯ are a guess by time: the video was made within 10 minutes after the step before it. Live sync replaces guesses with Grok's own links.
              </span>
            {/if}
            <div class="flex items-center gap-1.5 overflow-x-auto">
              {#each chain as c, n (c.id)}
                <div class="flex flex-none items-center gap-1.5">
                  {#if n > 0}
                    <span class="text-outline" style:opacity={app.grouping.inferred.has(c.id) ? 0.55 : 1} title={app.grouping.inferred.has(c.id) ? 'Likely (by time)' : 'From Grok'}>
                      <Icon name={app.grouping.inferred.has(c.id) ? 'more_horiz' : 'arrow_forward'} size={20} />
                    </span>
                  {/if}
                  <button
                    type="button"
                    onclick={() => setCur(c.id)}
                    class="flex flex-col gap-1.5 rounded-[18px] border-0 p-1.5 text-left text-on-surface"
                    style:background={c.id === it.id ? 'var(--color-primary-container)' : 'var(--color-surface-2)'}
                  >
                    <div class="relative h-24 w-24 overflow-hidden rounded-xl">
                      <Media item={c} radius={12} />
                      {#if c.kind === 'video'}
                        <span class="absolute top-[5px] right-[5px] text-white"><Icon name="play_circle" size={16} fill /></span>
                      {/if}
                    </div>
                    <span class="px-1 pb-0.5 text-xs text-on-variant">
                      {c.kind === 'video' ? `${app.grouping.origin.get(c.id) === 'extend' ? 'Extension' : 'Video'}${c.dur ? ' · ' + c.dur : ''}` : n === 0 ? 'Source image' : 'Image'}
                    </span>
                  </button>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        {#if variants.length}
          <div class="flex flex-col gap-3">
            <div class="flex items-baseline justify-between">
              <span class="text-base font-semibold">{batchKey?.startsWith('v:') ? 'Variations' : 'Same batch'}</span>
              <span class="text-[13px] text-outline">{variants.length + 1} {it.kind === 'video' ? 'videos' : 'images'}{batchKey?.startsWith('b:') ? ' · same prompt, made together' : ''}</span>
            </div>
            <div class="flex gap-2 overflow-x-auto">
              {#each variants as v (v.id)}
                <button type="button" onclick={() => setCur(v.id)} class="flex w-[140px] flex-none flex-col gap-1.5 border-0 bg-transparent p-0 text-left text-on-variant">
                  <div class="relative h-24 w-[140px] overflow-hidden rounded-[14px]"><Media item={v} radius={14} /></div>
                  <span class="clamp-2 text-xs leading-[1.35]">{v.prompt}</span>
                </button>
              {/each}
            </div>
          </div>
        {/if}

        <div class="flex flex-col gap-3">
          <span class="text-base font-semibold">Collections</span>
          <div class="flex flex-wrap gap-2">
            {#each itColls as c (c.id)}
              <button
                type="button"
                onclick={() => app.nav('collection', { coll: c.id })}
                class="flex h-8 items-center gap-1.5 rounded-lg border-0 bg-secondary-container px-3 text-[13px] font-medium text-on-secondary-container"
              >
                <Icon name="collections_bookmark" size={16} /><span>{c.name}</span>
              </button>
            {/each}
            <button
              type="button"
              onclick={() => app.openSheet([it.id])}
              class="flex h-8 items-center gap-1 rounded-lg border border-outline-variant bg-transparent px-3 text-[13px] font-medium text-on-variant"
            >
              <Icon name="add" size={18} /><span>Add</span>
            </button>
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <span class="text-base font-semibold">Notes</span>
          <textarea
            bind:value={it.notes}
            placeholder="Add a note. Notes are searchable."
            rows="3"
            class="w-full resize-none rounded-2xl border-0 bg-surface-2 px-4 py-3.5 text-[15px] leading-[1.45] text-on-surface outline-none select-text placeholder:text-outline"
          ></textarea>
        </div>

        <div class="flex flex-col rounded-[20px] bg-surface-1 py-1.5">
          {#snippet row(k: string, v: string, mono = false, onCopy?: () => void)}
            <div class="flex min-h-11 items-center justify-between gap-4 px-4 py-2.5">
              <span class="flex-none text-sm text-outline">{k}</span>
              <div class="flex min-w-0 items-center gap-1.5">
                <span class="truncate text-sm text-on-surface" class:font-mono={mono}>{v}</span>
                {#if onCopy}
                  <button type="button" aria-label="Copy {k}" onclick={onCopy} class="flex h-7 w-7 flex-none items-center justify-center rounded-full border-0 bg-transparent text-primary">
                    <Icon name="content_copy" size={18} />
                  </button>
                {/if}
              </div>
            </div>
          {/snippet}
          {@render row('Model', it.model)}
          {#if it.mode}{@render row('Mode', it.mode)}{/if}
          {#if it.seed != null}{@render row('Seed', String(it.seed), true, () => app.copy(String(it.seed), 'Seed copied'))}{/if}
          {@render row('Aspect', `${it.w}:${it.h}`)}
          {@render row('Created', dateTime(it.createdAt))}
          {@render row('Grok ID', grokId, true, () => app.copy(it.grokUrl, 'Grok link copied'))}
          {#if it.mediaUrl}{@render row('Asset', it.mediaUrl.replace(/^https?:\/\//, ''), true, () => app.copy(it.mediaUrl!, 'Asset URL copied'))}{/if}
        </div>
      </div>
    </div>
  </div>
{/if}
