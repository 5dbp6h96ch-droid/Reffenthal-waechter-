export async function renderWaechter(ctx) {
  ctx.activate('waechter');
  ctx.loading('Wächter');
  try {
    const [status, treffer] = await Promise.all([
      ctx.api('/api/waechter/status'),
      ctx.api('/api/waechter/treffer'),
    ]);
    const hits = treffer.hits || [];
    ctx.app.innerHTML = `<section class="card"><div class="eyebrow">Wächter</div><div class="gauge-name">R(h)einschiffer Wächter</div><div class="settings-row"><span>Letzter Lauf</span><span>${ctx.fmtDate(status.last_run_at)}</span></div><div class="settings-row"><span>Neue RSS-Treffer</span><strong>${Number(status.rss_new_count || 0)}</strong></div><div class="settings-row"><span>Status</span><span>${status.last_error ? 'Fehler' : 'OK'}</span></div>${status.last_error?`<div class="error">${ctx.esc(status.last_error)}</div>`:''}</section>${hits.length?`<div class="section-title">Letzte Treffer</div>${hits.map(h=>`<article class="card nfb-item compact-link-card"><div class="gauge-meta">${ctx.fmtDate(h.seen_at)}</div><a class="action-icon" href="${ctx.esc(h.url)}" target="_blank" rel="noopener" aria-label="Treffer öffnen"></a></article>`).join('')}`:'<div class="empty">Noch keine Wächter-Treffer gespeichert.</div>'}`;
  } catch (e) {
    ctx.errorView('Wächter', e);
  }
}
