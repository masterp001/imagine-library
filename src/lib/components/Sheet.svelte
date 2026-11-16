<script lang="ts">
  import type { Snippet } from 'svelte';
  let { onclose, children }: { onclose: () => void; children: Snippet } = $props();
</script>

<div
  class="fixed inset-0 z-10 bg-black/50 [animation:fade-in_160ms_ease-out]"
  role="presentation"
  onclick={onclose}
></div>
<div
  role="dialog"
  aria-modal="true"
  class="pb-safe fixed right-0 bottom-0 left-0 z-11 mx-auto flex max-h-[85dvh] max-w-[520px] flex-col overflow-y-auto rounded-t-[28px] bg-surface-2 pt-2.5 [animation:sheet-up_220ms_cubic-bezier(.2,.8,.2,1)]"
>
  <div class="mb-[18px] h-1 w-8 flex-none self-center rounded-sm bg-outline"></div>
  {@render children()}
  <div class="h-9 flex-none"></div>
</div>
