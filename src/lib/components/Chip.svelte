<script lang="ts">
  import Icon from './Icon.svelte';
  let { label, on, onclick }: { label: string; on: boolean; onclick: () => void } = $props();
</script>

<button
  type="button"
  {onclick}
  aria-pressed={on}
  class="state-layer flex h-8 flex-none items-center gap-1.5 rounded-lg border pr-3.5 text-sm font-medium transition-colors"
  class:pl-2={on}
  class:pl-3.5={!on}
  style:background={on ? 'var(--color-secondary-container)' : 'transparent'}
  style:color={on ? 'var(--color-on-secondary-container)' : 'var(--color-on-variant)'}
  style:border-color={on ? 'var(--color-secondary-container)' : 'var(--color-outline-variant)'}
>
  {#if on}<Icon name="check" size={18} />{/if}
  <span>{label}</span>
</button>
