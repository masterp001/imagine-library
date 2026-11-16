<script lang="ts">
  import { app } from '../app.svelte';
  import type { Item } from '../types';
  import Icon from './Icon.svelte';
  import Media from './Media.svelte';

  let { item, selectable = false, seq }: { item: Item; selectable?: boolean; seq?: () => string[] } = $props();

  const masonry = $derived(app.settings.layout === 'masonry');
  const radius = $derived(masonry ? 16 : 6);
  const inSel = $derived(selectable && app.selecting);
  const sel = $derived(inSel && app.selected.includes(item.id));
  const chain = $derived(!inSel && (!!item.parent || app.parents.has(item.id)));

  let timer: ReturnType<typeof setTimeout> | undefined;
  let longPressed = false;
  let sx = 0, sy = 0;

  function down(e: PointerEvent) {
    if (!selectable || e.button > 0) return;
    longPressed = false;
    sx = e.clientX;
    sy = e.clientY;
    clearTimeout(timer);
    timer = setTimeout(() => {
      longPressed = true;
      navigator.vibrate?.(20);
      app.startSelect(item.id);
    }, 450);
  }
  function move(e: PointerEvent) {
    if (timer && (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10)) cancel();
  }
  function cancel() {
    clearTimeout(timer);
    timer = undefined;
  }
  function click() {
    if (longPressed) {
      longPressed = false;
      return;
    }
    if (inSel) app.toggleSel(item.id);
    else app.nav('detail', { cur: item.id, seq: seq?.() });
  }
</script>

<div
  role="button"
  tabindex="0"
  aria-label={item.prompt}
  aria-pressed={inSel ? sel : undefined}
  class="no-callout relative mb-[var(--gap)] cursor-pointer overflow-hidden [break-inside:avoid]"
  style:border-radius="{radius}px"
  onclick={click}
  onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), click())}
  onpointerdown={down}
  onpointermove={move}
  onpointerup={cancel}
  onpointercancel={cancel}
  onpointerleave={cancel}
  oncontextmenu={(e) => e.preventDefault()}
>
  <div
    class="relative transition-transform duration-[160ms] ease-out"
    style:aspect-ratio={masonry ? `${item.w}/${item.h}` : '1/1'}
    style:border-radius="{radius}px"
    style:overflow="hidden"
    style:transform={sel ? 'scale(0.9)' : 'none'}
    style:outline={sel ? '3px solid var(--color-primary)' : 'none'}
    style:outline-offset="-3px"
  >
    <Media {item} {radius} />
    {#if item.rRated}
      <div class="absolute inset-0 backdrop-blur-xl"></div>
    {/if}
  </div>

  {#if masonry}
    <span class="pointer-events-none absolute bottom-[9px] left-2.5 font-mono text-[10px] text-white/70 [text-shadow:0_1px_2px_rgba(0,0,0,.5)]">
      {item.kind} · {item.w}:{item.h}
    </span>
  {/if}
  {#if item.kind === 'video'}
    <div class="pointer-events-none absolute top-1.5 right-1.5 flex h-[22px] items-center gap-0.5 rounded-[11px] bg-[rgba(20,18,24,0.72)] pr-[7px] pl-1 text-[11px] font-medium text-white">
      <Icon name="play_arrow" size={15} fill />
      {#if item.dur}<span>{item.dur}</span>{/if}
    </div>
  {/if}
  {#if item.fav && !inSel}
    <span class="pointer-events-none absolute right-2 bottom-[7px] text-fav"><Icon name="favorite" size={18} fill /></span>
  {/if}
  {#if chain}
    <span class="pointer-events-none absolute top-[7px] left-[7px] flex h-[22px] w-[22px] items-center justify-center rounded-[11px] bg-[rgba(20,18,24,0.72)] text-white">
      <Icon name="link" size={14} />
    </span>
  {/if}
  {#if inSel && sel}
    <span class="pointer-events-none absolute top-2 left-2 flex h-[26px] w-[26px] items-center justify-center rounded-[13px] bg-primary text-on-primary">
      <Icon name="check" size={18} weight={600} />
    </span>
  {:else if inSel}
    <span class="pointer-events-none absolute top-2 left-2 h-[26px] w-[26px] rounded-[13px] border-2 border-white/85 bg-[rgba(20,18,24,0.3)]"></span>
  {/if}
</div>
