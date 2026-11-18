<script lang="ts">
  import { app } from '../app.svelte';
  import Icon from '../components/Icon.svelte';
  import Media from '../components/Media.svelte';
  import Toggle from '../components/Toggle.svelte';
  import { EMPTY_STRIPE, num } from '../format';
  import { desk } from '../desktop';
  import { fmtBytes, offline } from '../offline.svelte';

  const eligible = $derived(offline.eligible(app.items).length);
  const have = $derived(app.items.reduce((n, i) => n + (offline.files[i.id] ? 1 : 0), 0));
  const missing = $derived(Math.max(0, eligible - have));
  const pct = $derived(eligible ? Math.round((have / eligible) * 100) : 0);
  const runPct = $derived(offline.total ? Math.round((offline.done / offline.total) * 100) : 0);
  const active = $derived(Object.entries(offline.active));
  const errs = $derived(Object.entries(offline.errors).slice(0, 30));

  const colls = $derived(
    app.colls.map((c) => {
      const its = app.collItems(c.id);
      const can = offline.eligible(its);
      return { ...c, its, can: can.length, have: can.filter((i) => offline.files[i.id]).length };
    })
  );

  let confirmDel = $state(false);
  function delAll() {
    if (!confirmDel) {
      confirmDel = true;
      app.say('Tap again to delete all offline copies');
      setTimeout(() => (confirmDel = false), 3000);
      return;
    }
    confirmDel = false;
    offline.removeAll().then(() => app.say('Offline copies deleted'));
  }

  async function startAll() {
    const n = await offline.start();
    if (!n) app.say(eligible ? 'Everything is already offline' : 'Import your export first');
  }

  function setPar(n: number) {
    offline.settings.parallel = n;
    offline.saveSettings();
  }
</script>

<div class="flex min-h-0 flex-1 flex-col">
  <div class="flex-none px-5 py-3">
    <h1 class="m-0 text-[30px] font-semibold tracking-[-0.02em]">Offline</h1>
  </div>
  <div class="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pb-[calc(120px+env(safe-area-inset-bottom))] lg:pb-12">
    <!-- status -->
    <div class="flex flex-col gap-4 rounded-[28px] bg-surface-3 p-5">
      <div class="flex items-center gap-3.5">
        <div class="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-primary-container text-on-primary-container">
          <Icon name={missing === 0 && eligible > 0 ? 'offline_pin' : offline.running ? 'download_for_offline' : 'cloud_off'} size={26} />
        </div>
        <div class="flex min-w-0 flex-col gap-0.5">
          <span class="text-[17px] font-semibold">{num(have)} of {num(eligible)} offline</span>
          <span class="text-[13px] text-on-variant">{fmtBytes(offline.bytes)} on this device{missing ? ` · ${num(missing)} to go` : ''}</span>
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <div class="h-1.5 overflow-hidden rounded-[3px] bg-outline-variant">
          <div class="h-full rounded-[3px] bg-primary transition-[width] duration-300" style:width="{offline.running ? runPct : pct}%"></div>
        </div>
        <span class="text-[13px] text-on-variant">
          {#if offline.running && !offline.paused}
            Downloading {num(offline.done)} of {num(offline.total)}{offline.failed ? ` · ${offline.failed} failed` : ''}
          {:else if offline.note}
            {offline.note}
          {:else if eligible === 0}
            {app.demo ? 'The demo library has no real files. Import your export first.' : 'No downloadable items yet. Import your export first.'}
          {:else if missing === 0}
            Everything is available offline.
          {:else}
            {pct}% offline
          {/if}
        </span>
      </div>

      {#each active as [id, p] (id)}
        {@const it = app.byId.get(id)}
        {#if it}
          <div class="flex items-center gap-3">
            <div class="relative h-9 w-9 flex-none overflow-hidden rounded-lg" style:background={EMPTY_STRIPE}><Media item={it} radius={8} /></div>
            <div class="flex min-w-0 flex-1 flex-col gap-1">
              <span class="truncate text-[13px]">{it.prompt || it.id}</span>
              <div class="h-1 overflow-hidden rounded-sm bg-outline-variant">
                <div class="h-full bg-ok transition-[width] duration-150" style:width="{p.size ? Math.round((p.got / p.size) * 100) : 8}%"></div>
              </div>
            </div>
            <span class="flex-none font-mono text-[11px] text-outline">{p.got ? fmtBytes(p.got) : '…'}</span>
          </div>
        {/if}
      {/each}

      <div class="flex gap-2">
        {#if offline.running && !offline.paused}
          <button type="button" onclick={() => offline.pause()} class="flex h-12 flex-1 items-center justify-center gap-2 rounded-3xl border-0 bg-primary text-[15px] font-semibold text-on-primary">
            <Icon name="pause" size={20} /><span>Pause</span>
          </button>
        {:else if offline.left > 0}
          <button type="button" onclick={() => offline.resume()} class="flex h-12 flex-1 items-center justify-center gap-2 rounded-3xl border-0 bg-primary text-[15px] font-semibold text-on-primary">
            <Icon name="play_arrow" size={20} /><span>Resume ({num(offline.left)})</span>
          </button>
          <button type="button" onclick={() => offline.cancel()} class="flex h-12 w-12 flex-none items-center justify-center rounded-3xl border border-outline bg-transparent text-on-variant" aria-label="Stop">
            <Icon name="stop" size={20} />
          </button>
        {:else}
          <button
            type="button"
            disabled={missing === 0}
            onclick={startAll}
            class="flex h-12 flex-1 items-center justify-center gap-2 rounded-3xl border-0 bg-primary text-[15px] font-semibold text-on-primary disabled:opacity-50"
          >
            <Icon name="download_for_offline" size={20} /><span>{missing ? `Download all (${num(missing)})` : 'All downloaded'}</span>
          </button>
        {/if}
      </div>
      {#if offline.failed && !(offline.running && !offline.paused)}
        <button type="button" onclick={() => offline.retryFailed()} class="flex h-11 items-center justify-center gap-1.5 rounded-[22px] border border-outline bg-transparent text-sm font-semibold text-primary">
          <Icon name="refresh" size={18} /><span>Retry {offline.failed} failed</span>
        </button>
      {/if}
    </div>

    {#if !offline.native && !offline.desktop}
      <div class="flex gap-3 rounded-3xl bg-surface-1 p-4 text-[13px] leading-normal text-on-variant">
        <span class="flex-none text-ok"><Icon name="error" size={20} /></span>
        <span>
          You're using the browser version. Downloads here only work if assets.grok.com allows cross-site requests.
          The <b class="text-on-surface">Android app</b> downloads natively and can send your grok.com cookie.
        </span>
      </div>
    {/if}

    <!-- collections -->
    {#if colls.length}
      <div class="flex flex-col gap-1">
        <span class="px-1 pb-1.5 text-sm font-medium text-on-variant">Collections</span>
        <div class="flex flex-col rounded-3xl bg-surface-1 py-1.5">
          {#each colls as c (c.id)}
            <div class="flex items-center gap-3 py-1.5 pr-1.5 pl-4">
              <button type="button" onclick={() => app.nav('collection', { coll: c.id })} class="flex min-w-0 flex-1 items-center gap-3 border-0 bg-transparent p-0 text-left text-on-surface">
                <div class="relative h-11 w-11 flex-none overflow-hidden rounded-xl" style:background={EMPTY_STRIPE}>
                  {#if c.its[0]}<Media item={c.its[0]} radius={12} />{/if}
                </div>
                <div class="flex min-w-0 flex-col gap-0.5">
                  <span class="truncate text-[15px] font-medium">{c.name}</span>
                  <span class="text-[13px]" style:color={c.can && c.have === c.can ? 'var(--color-primary)' : 'var(--color-outline)'}>
                    {c.can ? `${c.have}/${c.can} offline` : `${c.its.length} items`}
                  </span>
                </div>
              </button>
              <button
                type="button"
                aria-label="Download {c.name}"
                title="Download for offline"
                disabled={!c.can || c.have === c.can}
                onclick={() => offline.start(c.its.map((i) => i.id)).then((n) => app.say(n ? `Downloading ${n} from “${c.name}”` : 'Already offline'))}
                class="state-layer flex h-11 w-11 flex-none items-center justify-center rounded-full border-0 bg-transparent text-on-variant disabled:opacity-35"
              >
                <Icon name={c.can && c.have === c.can ? 'offline_pin' : 'download_for_offline'} size={22} />
              </button>
              <button
                type="button"
                aria-label="{offline.saveLabel}: {c.name}"
                title={offline.saveLabel}
                disabled={!c.can || offline.exporting}
                onclick={() => offline.exportItems(c.its.map((i) => i.id), c.name)}
                class="state-layer flex h-11 w-11 flex-none items-center justify-center rounded-full border-0 bg-transparent text-on-variant disabled:opacity-35"
              >
                <Icon name="download_2" size={22} />
              </button>
            </div>
          {/each}
        </div>
        <span class="px-1 pt-1 text-xs leading-normal text-outline">
          <Icon name="download_2" size={13} /> saves a copy to {offline.desktop ? 'a folder you pick, as <folder>/<collection>' : offline.native ? 'Documents/Imagine Library/<collection> — visible in your Files app' : 'your Downloads'}.
        </span>
      </div>
    {/if}

    <!-- settings -->
    <div class="flex flex-col gap-1">
      <span class="px-1 pb-1.5 text-sm font-medium text-on-variant">Settings</span>
      <div class="rounded-3xl bg-surface-1 py-1">
        <Toggle
          label="Download automatically"
          sub="New items after every import and on app start"
          on={offline.settings.auto}
          onchange={(v) => ((offline.settings.auto = v), offline.saveSettings())}
        />
        <Toggle
          label="Wi-Fi only"
          sub="Pause on mobile data, continue on Wi-Fi"
          on={offline.settings.wifiOnly}
          onchange={(v) => ((offline.settings.wifiOnly = v), offline.saveSettings())}
        />
        <div class="flex items-center gap-4 px-4 py-3">
          <span class="flex flex-1 flex-col gap-0.5">
            <span class="text-[15px]">Videos</span>
            <span class="text-[13px] text-outline">{offline.settings.videos === 'off' ? 'Stay online-only, saves most space' : offline.settings.videos === 'hd' ? 'HD where available, else SD' : 'SD, smaller files'}</span>
          </span>
          <div class="flex overflow-hidden rounded-[18px] border border-outline">
            {#each [['hd', 'HD'], ['sd', 'SD'], ['off', 'Off']] as [v, l] (v)}
              <button
                type="button"
                onclick={() => ((offline.settings.videos = v as 'hd' | 'sd' | 'off'), offline.saveSettings())}
                class="h-9 w-11 border-0 text-sm font-medium"
                style:background={offline.settings.videos === v ? 'var(--color-secondary-container)' : 'transparent'}
                style:color={offline.settings.videos === v ? 'var(--color-on-secondary-container)' : 'var(--color-on-variant)'}
              >{l}</button>
            {/each}
          </div>
        </div>
        <div class="flex items-center gap-4 px-4 py-3">
          <span class="flex flex-1 flex-col gap-0.5">
            <span class="text-[15px]">Parallel downloads</span>
            <span class="text-[13px] text-outline">More is faster, fewer is gentler</span>
          </span>
          <div class="flex overflow-hidden rounded-[18px] border border-outline">
            {#each [1, 2, 3, 4, 6] as n (n)}
              <button
                type="button"
                onclick={() => setPar(n)}
                class="h-9 w-9 border-0 text-sm font-medium"
                style:background={offline.settings.parallel === n ? 'var(--color-secondary-container)' : 'transparent'}
                style:color={offline.settings.parallel === n ? 'var(--color-on-secondary-container)' : 'var(--color-on-variant)'}
              >{n}</button>
            {/each}
          </div>
        </div>
      </div>
    </div>

    {#if offline.desktop}
      <div class="flex flex-col gap-1">
        <span class="px-1 pb-1.5 text-sm font-medium text-on-variant">Grok account</span>
        <div class="flex items-center gap-3 rounded-3xl bg-surface-1 py-3 pr-3 pl-4">
          <span style:color={offline.grokIn ? 'var(--color-ok)' : 'var(--color-outline)'}><Icon name={offline.grokIn ? 'check_circle' : 'cookie'} size={24} fill={offline.grokIn} /></span>
          <span class="flex min-w-0 flex-1 flex-col gap-0.5">
            <span class="text-[15px]">{offline.grokIn ? 'Signed in to Grok' : 'Not signed in'}</span>
            <span class="text-[13px] text-outline">Downloads use this sign-in. It stays only in this app.</span>
          </span>
          {#if offline.grokIn}
            <button type="button" onclick={() => offline.grokLogout()} class="h-10 rounded-[20px] border border-outline bg-transparent px-4 text-sm font-semibold text-on-variant">Sign out</button>
          {:else}
            <button type="button" onclick={() => offline.grokLogin()} class="h-10 rounded-[20px] border-0 bg-primary px-4 text-sm font-semibold text-on-primary">Sign in</button>
          {/if}
        </div>
        <span class="px-1 pt-1 text-xs leading-normal text-outline">Opens grok.com in a separate window. Sign in, then close that window.</span>
      </div>

      <div class="flex flex-col gap-1">
        <span class="px-1 pb-1.5 text-sm font-medium text-on-variant">Download folder</span>
        <div class="flex items-center gap-3 rounded-3xl bg-surface-1 py-3 pr-3 pl-4">
          <span class="text-on-variant"><Icon name="folder" size={24} /></span>
          <span class="min-w-0 flex-1 truncate font-mono text-[13px] select-text" title={offline.dir}>{offline.dir}</span>
          <button type="button" onclick={() => desk?.openFolder()} class="h-10 rounded-[20px] border border-outline bg-transparent px-4 text-sm font-semibold text-primary">Open</button>
          <button type="button" onclick={() => offline.chooseFolder()} class="h-10 rounded-[20px] border border-outline bg-transparent px-4 text-sm font-semibold text-primary">Change</button>
        </div>
        <span class="px-1 pt-1 text-xs leading-normal text-outline">Files are kept as media/&lt;id&gt; with thumbnails in thumbs/. Changing the folder moves existing downloads.</span>
      </div>
    {:else}
    <div class="flex flex-col gap-1">
      <span class="flex items-center gap-1.5 px-1 pb-1.5 text-sm font-medium text-on-variant"><Icon name="cookie" size={18} />grok.com cookie (optional)</span>
      <div class="flex flex-col gap-2 rounded-3xl bg-surface-1 p-4">
        <span class="text-[13px] leading-normal text-on-variant">
          Only needed if downloads fail with HTTP 401/403. On your PC open grok.com → DevTools → Network → any request to assets.grok.com → copy the
          <span class="font-mono text-on-surface">cookie</span> request header and paste it here. Stays on this phone; sent only to assets.grok.com.
        </span>
        <textarea
          bind:value={offline.settings.cookie}
          onchange={() => offline.saveSettings()}
          rows="3"
          placeholder="sso=…; sso-rw=…; cf_clearance=…"
          class="w-full resize-none rounded-2xl border-0 bg-surface-3 px-4 py-3 font-mono text-[12px] leading-normal text-on-surface outline-none select-text placeholder:text-outline"
        ></textarea>
        {#if !offline.native}<span class="text-xs text-outline">Browsers don't allow sending cookies this way — the cookie is used by the Android app only.</span>{/if}
      </div>
    </div>
    {/if}

    {#if errs.length}
      <div class="flex flex-col gap-1">
        <span class="px-1 pb-1.5 text-sm font-medium text-on-variant">Failed ({offline.failed})</span>
        <div class="flex flex-col rounded-3xl bg-surface-1 py-1.5">
          {#each errs as [id, msg] (id)}
            {@const it = app.byId.get(id)}
            <button type="button" onclick={() => app.nav('detail', { cur: id, seq: errs.map(([e]) => e) })} class="flex items-start gap-3 border-0 bg-transparent px-4 py-2 text-left text-on-surface">
              <span class="mt-0.5 flex-none text-fav"><Icon name="error" size={18} /></span>
              <span class="flex min-w-0 flex-col gap-0.5">
                <span class="truncate text-sm">{it?.prompt || id}</span>
                <span class="text-xs text-outline">{msg}</span>
              </span>
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <div class="flex flex-col gap-1">
      <span class="px-1 pb-1.5 text-sm font-medium text-on-variant">Storage</span>
      <button
        type="button"
        onclick={delAll}
        disabled={!offline.count}
        class="flex h-11 items-center justify-center gap-1.5 rounded-[22px] border bg-transparent text-sm font-medium disabled:opacity-40"
        style:border-color={confirmDel ? 'var(--color-fav)' : 'var(--color-outline-variant)'}
        style:color={confirmDel ? 'var(--color-fav)' : 'var(--color-on-variant)'}
      >
        <Icon name="delete" size={18} /><span>{confirmDel ? 'Tap to confirm' : `Delete offline copies (${fmtBytes(offline.bytes)})`}</span>
      </button>
      <span class="px-1 pt-1 text-xs leading-normal text-outline">Your library, collections and notes stay.{offline.desktop ? '' : ' Keep the app open while a big download runs — Android pauses apps in the background.'}</span>
    </div>
  </div>
</div>
