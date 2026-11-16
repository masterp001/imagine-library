<script lang="ts">
  import { app } from '../app.svelte';
  import { stripe } from '../format';
  import { thumbUrl } from '../thumbhash';
  import type { Item } from '../types';

  /**
   * Shows the real asset when possible, layered over the thumbhash placeholder,
   * falling back to the striped placeholder from the design.
   * `full` = detail view (video gets controls, image loads full size).
   */
  let { item, full = false, radius = 0 }: { item: Item; full?: boolean; radius?: number } = $props();

  let failed = $state(false);
  let loaded = $state(false);
  const hash = $derived(thumbUrl(item.thumbhash));
  const bg = $derived(hash ? `center / cover no-repeat url("${hash}")` : stripe(item.hue));
  const src = $derived.by(() => {
    if (!app.settings.loadMedia || failed) return null;
    if (item.kind === 'image') return full ? (item.mediaUrl ?? item.thumbUrl) : (item.thumbUrl ?? item.mediaUrl);
    return item.thumbUrl;
  });
  const videoSrc = $derived(app.settings.loadMedia && !failed && item.kind === 'video' && (full || !item.thumbUrl) ? item.mediaUrl : null);

  $effect(() => {
    void item.id;
    failed = false;
    loaded = false;
  });
</script>

<div class="absolute inset-0 overflow-hidden" style:background={bg} style:border-radius="{radius}px">
  {#if videoSrc}
    {#if full}
      <!-- svelte-ignore a11y_media_has_caption -->
      <video
        src={videoSrc}
        class="absolute inset-0 h-full w-full object-contain transition-opacity duration-200"
        style:opacity={loaded ? 1 : 0}
        controls
        playsinline
        loop
        preload="metadata"
        onloadeddata={() => (loaded = true)}
        onerror={() => (failed = true)}
      ></video>
    {:else}
      <video
        src="{videoSrc}#t=0.1"
        class="absolute inset-0 h-full w-full object-cover transition-opacity duration-200"
        style:opacity={loaded ? 1 : 0}
        muted
        playsinline
        preload="metadata"
        onloadeddata={() => (loaded = true)}
        onerror={() => (failed = true)}
      ></video>
    {/if}
  {:else if src}
    <img
      {src}
      alt={item.prompt}
      loading="lazy"
      decoding="async"
      draggable="false"
      referrerpolicy="no-referrer"
      class="absolute inset-0 h-full w-full transition-opacity duration-200 {full ? 'object-contain' : 'object-cover'}"
      style:opacity={loaded ? 1 : 0}
      onload={() => (loaded = true)}
      onerror={() => (failed = true)}
    />
  {/if}
</div>
