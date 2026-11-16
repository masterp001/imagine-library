<script lang="ts">
  let { label, sub, on, onchange }: { label: string; sub: string; on: boolean; onchange: (v: boolean) => void } = $props();
</script>

<button
  type="button"
  role="switch"
  aria-checked={on}
  onclick={() => onchange(!on)}
  class="flex w-full items-center gap-4 border-0 bg-transparent px-4 py-3 text-left text-on-surface"
>
  <span class="flex flex-1 flex-col gap-0.5">
    <span class="text-[15px]">{label}</span>
    <span class="text-[13px] text-outline">{sub}</span>
  </span>
  <span
    class="flex h-8 w-[52px] flex-none items-center rounded-2xl border-2 px-1 transition-colors duration-150"
    style:background={on ? 'var(--color-primary)' : 'var(--color-surface-4)'}
    style:border-color={on ? 'var(--color-primary)' : 'var(--color-outline)'}
    style:justify-content={on ? 'flex-end' : 'flex-start'}
  >
    <span
      class="rounded-full transition-all duration-150"
      style:width="{on ? 24 : 16}px"
      style:height="{on ? 24 : 16}px"
      style:background={on ? 'var(--color-on-primary)' : 'var(--color-outline)'}
    ></span>
  </span>
</button>
