<script lang="ts">
  import { ICONS, type IconName } from '../icons';

  let { name, size = 24, fill = false, weight = 400, class: cls = '' }: {
    name: IconName;
    size?: number;
    fill?: boolean;
    weight?: number;
    class?: string;
  } = $props();
</script>

<span
  class="icon {cls}"
  aria-hidden="true"
  style:font-size="{size}px"
  style:font-variation-settings="'FILL' {fill ? 1 : 0}, 'wght' {weight}, 'opsz' {Math.min(48, Math.max(20, size))}"
>{String.fromCodePoint(ICONS[name])}</span>
