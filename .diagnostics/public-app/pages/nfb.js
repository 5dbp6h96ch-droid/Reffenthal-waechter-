const NFB_KM_KEY = 'nfb_km_range';
const DEFAULT_VON = 1;
const DEFAULT_BIS = 900;

function loadRange() {
  try {
    const raw = localStorage.getItem(NFB_KM_KEY);
    if (!raw) return { von: DEFAULT_VON, bis: DEFAULT_BIS };
    const parsed = JSON.parse(raw);
    const von = Number(parsed?.von);
    const bis = Number(parsed?.bis);
    if (Number.isFinite(von) && Number.isFinite(bis) && von <= bis) return { von, bis };
  } catch {}
  return { von: DEFAULT_VON, bis: DEFAULT_BIS };
}

function saveRange(von, bis) {
  try { localStorage.setItem(NFB_KM_KEY, JSON.stringify({ von, bis })); } catch {}
}

function restoreClose(ctx){
  if (document.querySelector('.page-close-bar')) return;
  ctx.app.insertAdjacentHTML('afterbegin','<div class="page-close-bar"><a class="page-close" href="#/pegel?menu=1" aria-label="Schließen und zum Menü zurückkehren">×</a></div>');
}

export async function renderNfbPage(ctx) {
  const { app, api, esc, fmtKm, activate, loading, errorView } = ctx;
  activate('nfb');
  loading('NfB');

  const render = async (von, bis) => {
    try {
      const params = new URLSearchParams({ km_von: String(von), km_bis: String(bis) });
      const d = await api(`/api/nfb?${params.toString()}`);
      const list = (d.meldungen || []).slice().sort((a, b) =>
        Number(a.km_von ?? a.river_km_from ?? 0) - Number(b.km_von ?? b.river_km_from ?? 0));

      app.innerHTML = `
        <section class="card">
          <div class="eyebrow">Nachrichten für Binnenschifffahrt</div>
          <div class="gauge-name">NfB / WSV</div>
          <div class="gauge-meta">Aktive Meldungen für deinen Rheinabschnitt</div>
          <div style="display:flex;gap:8px;align-items:end;flex-wrap:wrap;margin-top:14px">
            <label style="flex:1;min-width:110px">
              <span class="gauge-meta">km von</span>
              <input id="nfb-km-von" class="control" type="number" inputmode="numeric" value="${esc(String(von))}" min="0" max="1500">
            </label>
            <label style="flex:1;min-width:110px">
              <span class="gauge-meta">km bis</span>
              <input id="nfb-km-bis" class="control" type="number" inputmode="numeric" value="${esc(String(bis))}" min="0" max="1500">
            </label>
            <button id="nfb-km-apply" class="control" style="width:auto;min-width:110px">Anwenden</button>
          </div>
          <div id="nfb-km-status" class="gauge-meta" style="margin-top:8px">Rhein-km ${esc(String(von))}–${esc(String(bis))} · ${list.length} Meldung${list.length === 1 ? '' : 'en'}</div>
        </section>
        ${list.length ? list.map(m => {
          const kmVon = m.km_von ?? m.river_km_from;
          const kmBis = m.km_bis ?? m.river_km_to;
          const title = m.titel ?? m.title ?? '';
          const url = m.url ?? m.source_url;
          const range = kmVon == null && kmBis == null
            ? 'Allgemeine Meldung ohne km-Angabe'
            : kmVon != null && kmBis != null
              ? `Rhein-km ${fmtKm(kmVon)} bis ${fmtKm(kmBis)}`
              : `Rhein-km ${fmtKm(kmVon ?? kmBis)}`;
          return `<article class="card nfb-item compact-link-card"><h3>${esc(title)}</h3><p>${esc(m.body || '')}</p><p>${esc(range)}</p>${url ? `<a class="action-icon" href="${esc(url)}" target="_blank" rel="noopener" aria-label="Quelle öffnen"></a>` : ''}</article>`;
        }).join('') : '<div class="empty">Keine aktiven Meldungen in diesem km-Bereich vorhanden.</div>'}`;

      document.querySelector('#nfb-km-apply')?.addEventListener('click', async () => {
        const status = document.querySelector('#nfb-km-status');
        const nextVon = Number(document.querySelector('#nfb-km-von')?.value);
        const nextBis = Number(document.querySelector('#nfb-km-bis')?.value);
        if (!Number.isFinite(nextVon) || !Number.isFinite(nextBis) || nextVon > nextBis) {
          if (status) status.textContent = 'Bitte einen gültigen km-Bereich eingeben (von ≤ bis).';
          return;
        }
        saveRange(nextVon, nextBis);
        await render(nextVon, nextBis);
        restoreClose(ctx);
      });
    } catch (e) {
      errorView('NfB', e);
    }
  };

  const { von, bis } = loadRange();
  await render(von, bis);
}
