export async function renderStartPage(ctx) {
  const { app, state, ensureGauges, esc, fmtKm, menuRows, activate, loading, errorView } = ctx;
  activate('start');
  loading('Start');
  try {
    await ensureGauges();
    const g = state.selected;
    app.innerHTML = `<section class="card"><div class="eyebrow">R(h)einschiffer</div><div class="gauge-name">${g ? esc(g.name) : 'Kein Pegel gewählt'}</div><div class="gauge-meta">${g ? `Rhein-km ${fmtKm(g.river_km)}` : 'Bitte Pegel auswählen'}</div></section><div class="section-title">Menü</div>${menuRows()}`;
  } catch (e) {
    errorView('Start', e);
  }
}
