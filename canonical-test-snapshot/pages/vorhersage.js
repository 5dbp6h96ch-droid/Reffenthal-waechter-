export async function renderForecastPage(ctx) {
  const { app, state, api, esc, ensureGauges, activate, loading, errorView } = ctx;
  activate('vorhersage');
  loading('Vorhersage');
  try {
    await ensureGauges();
    if (!state.selected) throw new Error('Kein Pegel in den Einstellungen ausgewählt.');
    const f = await api(`/api/gauges/${encodeURIComponent(state.selected.id)}/forecast`);
    const hasForecast = f.available && f.gif_url;
    app.innerHTML = `<section class="card"><div class="eyebrow">Amtliche Vorhersage</div><div class="gauge-name">${esc(state.selected.name)}</div><div class="gauge-meta">${esc(f.provider || 'Keine Quelle verfügbar')}</div>${hasForecast ? `<button id="forecast-image-open" class="forecast-image-button" type="button" aria-label="Vorhersagebild vergrößern"><img class="forecast-img" src="${esc(f.gif_url)}" alt="Wasserstands-Vorhersage ${esc(state.selected.name)}"></button>` : `<div class="empty">Für diesen Pegel ist derzeit keine verifizierte Wasserstands-Vorhersage eingebunden.</div>`}</section>`;

    if (hasForecast) {
      const openButton = document.querySelector('#forecast-image-open');
      const closeFullscreen = () => {
        document.querySelector('#forecast-fullscreen')?.remove();
        document.body.classList.remove('forecast-fullscreen-open');
        document.removeEventListener('keydown', onKeyDown);
      };
      const onKeyDown = event => { if (event.key === 'Escape') closeFullscreen(); };
      openButton?.addEventListener('click', () => {
        if (document.querySelector('#forecast-fullscreen')) return;
        const overlay = document.createElement('div');
        overlay.id = 'forecast-fullscreen';
        overlay.className = 'forecast-fullscreen';
        overlay.innerHTML = `<button class="forecast-fullscreen-close" type="button" aria-label="Vollbild schließen">×</button><div class="forecast-fullscreen-stage"><img src="${esc(f.gif_url)}" alt="Wasserstands-Vorhersage ${esc(state.selected.name)} in Vollbild"></div>`;
        document.body.appendChild(overlay);
        document.body.classList.add('forecast-fullscreen-open');
        overlay.querySelector('.forecast-fullscreen-close')?.addEventListener('click', closeFullscreen);
        overlay.addEventListener('click', event => { if (event.target === overlay) closeFullscreen(); });
        document.addEventListener('keydown', onKeyDown);
      });
    }
  } catch (e) {
    errorView('Vorhersage', e);
  }
}
