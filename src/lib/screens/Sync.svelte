<script lang="ts">
  import { app } from '../app.svelte';
  import Icon from '../components/Icon.svelte';
  import Toggle from '../components/Toggle.svelte';
  import { ago, dateTime, num } from '../format';

  let fileInput = $state<HTMLInputElement>();
  let confirmClear = $state(false);

  async function onFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    try {
      const text = await f.text();
      await app.importText(text, f.name);
    } catch {
      app.say('Could not read that file');
    }
  }

  function clearLib() {
    if (!confirmClear) {
      confirmClear = true;
      app.say('Tap again to delete everything on this device');
      setTimeout(() => (confirmClear = false), 3000);
      return;
    }
    confirmClear = false;
    app.clearLibrary();
  }

  const steps = [
    'Request your data export from your grok.com account settings and download it.',
    'Unzip it and locate the JSON file with your Imagine generations (conversation list with asset metadata).',
    'Import the file here or paste its contents. Duplicates are merged — favorites, ratings, notes and collections are kept.'
  ];
</script>

<input bind:this={fileInput} type="file" accept=".json,.jsonl,.txt,application/json,text/plain" class="hidden" onchange={onFile} />

<div class="flex min-h-0 flex-1 flex-col">
  <div class="flex-none px-5 py-3">
    <h1 class="m-0 text-[30px] font-semibold tracking-[-0.02em]">Import</h1>
  </div>
  <div class="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pb-[calc(120px+env(safe-area-inset-bottom))]">
    <div class="flex flex-col gap-4 rounded-[28px] bg-surface-3 p-5">
      <div class="flex items-center gap-3.5">
        <div class="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-primary-container text-on-primary-container">
          <Icon name={app.demo ? 'science' : 'cloud_done'} size={26} />
        </div>
        <div class="flex flex-col gap-0.5">
          <span class="text-[17px] font-semibold">{app.demo ? 'Showing demo library' : 'Library on this device'}</span>
          <span class="text-[13px] text-on-variant">
            {app.demo ? 'Import your export to replace it' : `Last import ${ago(app.lastImport)} · ${num(app.items.length)} generations`}
          </span>
        </div>
      </div>
      {#if app.importing}
        <div class="flex flex-col gap-2">
          <div class="h-1.5 overflow-hidden rounded-[3px] bg-outline-variant">
            <div class="h-full rounded-[3px] bg-primary transition-[width] duration-150 ease-linear" style:width="{app.importPct}%"></div>
          </div>
          <span class="text-[13px] text-on-variant">{app.importLine}</span>
        </div>
      {/if}
      <button
        type="button"
        disabled={app.importing}
        onclick={() => fileInput?.click()}
        class="flex h-12 items-center justify-center gap-2 rounded-3xl border-0 bg-primary text-[15px] font-semibold text-on-primary disabled:opacity-70"
      >
        <Icon name="sync" size={20} />
        <span>{app.importing ? 'Importing…' : 'Import export file'}</span>
      </button>
    </div>

    <div class="flex flex-col gap-1">
      <span class="px-1 pb-1.5 text-sm font-medium text-on-variant">Grok export</span>
      <div class="flex flex-col gap-4 rounded-3xl bg-surface-1 p-4">
        <div class="flex flex-col gap-3">
          {#each steps as t, n (n)}
            <div class="flex items-start gap-3">
              <span class="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-secondary-container text-xs font-semibold text-on-secondary-container">{n + 1}</span>
              <span class="pt-0.5 text-sm leading-[1.45] text-pretty text-on-variant">{t}</span>
            </div>
          {/each}
        </div>
        <div class="flex gap-2">
          <button
            type="button"
            onclick={() => fileInput?.click()}
            class="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-[22px] border border-outline bg-transparent text-sm font-semibold text-primary"
          >
            <Icon name="upload_file" size={18} /><span>Import file</span>
          </button>
          <button
            type="button"
            onclick={() => app.openPaste()}
            class="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-[22px] border border-outline bg-transparent text-sm font-semibold text-primary"
          >
            <Icon name="content_paste" size={18} /><span>Paste</span>
          </button>
        </div>
        <div class="text-xs leading-normal text-pretty text-outline">
          Your library is stored only on this device. Images are loaded straight from assets.grok.com; nothing is uploaded anywhere.
        </div>
      </div>
    </div>

    <div class="flex flex-col gap-1">
      <span class="px-1 pb-1.5 text-sm font-medium text-on-variant">Display</span>
      <div class="rounded-3xl bg-surface-1 py-1">
        <Toggle label="Load media from Grok" sub="Off shows placeholders only, saves data" on={app.settings.loadMedia} onchange={(v) => (app.settings.loadMedia = v)} />
        <Toggle label="Hide R-rated" sub="Otherwise shown blurred in the grid" on={app.settings.hideRRated} onchange={(v) => (app.settings.hideRRated = v)} />
        <Toggle label="Smart groups strip" sub="Show groups above the library" on={app.settings.showSmartStrip} onchange={(v) => (app.settings.showSmartStrip = v)} />
      </div>
    </div>

    {#if app.history.length}
      <div class="flex flex-col gap-1">
        <span class="px-1 pb-1.5 text-sm font-medium text-on-variant">History</span>
        {#each app.history as h (h.at)}
          <div class="flex justify-between gap-4 px-1 py-2.5 text-sm">
            <span class="text-on-surface">{dateTime(h.at)}</span>
            <span class="truncate text-outline">{h.added} new{h.updated ? ` · ${h.updated} updated` : ''}</span>
          </div>
        {/each}
      </div>
    {/if}

    <div class="flex flex-col gap-1">
      <span class="px-1 pb-1.5 text-sm font-medium text-on-variant">Library</span>
      <div class="flex gap-2">
        <button
          type="button"
          onclick={() => app.loadDemo()}
          class="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-[22px] border border-outline-variant bg-transparent text-sm font-medium text-on-variant"
        >
          <Icon name="science" size={18} /><span>Load demo</span>
        </button>
        <button
          type="button"
          onclick={clearLib}
          class="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-[22px] border bg-transparent text-sm font-medium"
          style:border-color={confirmClear ? 'var(--color-fav)' : 'var(--color-outline-variant)'}
          style:color={confirmClear ? 'var(--color-fav)' : 'var(--color-on-variant)'}
        >
          <Icon name="delete" size={18} /><span>{confirmClear ? 'Tap to confirm' : 'Clear library'}</span>
        </button>
      </div>
    </div>
  </div>
</div>
