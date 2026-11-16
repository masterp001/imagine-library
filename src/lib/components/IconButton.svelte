<script lang="ts">
  import type { IconName } from '../icons';
  import Icon from './Icon.svelte';

  let { icon, label, onclick, fill = false, color = 'var(--color-on-variant)', size = 48, iconSize = 24 }: {
    icon: IconName;
    label: string;
    onclick: () => void;
    fill?: boolean;
    color?: string;
    size?: number;
    iconSize?: number;
  } = $props();
</script>

<button
  type="button"
  title={label}
  aria-label={label}
  {onclick}
  class="state-layer flex shrink-0 items-center justify-center rounded-full border-0 bg-transparent"
  style:width="{size}px"
  style:height="{size}px"
  style:color={color}
>
  <Icon name={icon} size={iconSize} {fill} />
</button>
