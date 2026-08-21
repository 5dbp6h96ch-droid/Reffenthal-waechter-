export async function renderNews(ctx) {
  ctx.activate('news');
  ctx.loading('News');
  try {
    const data = await ctx.api('/api/news');
    const items = data.items || [];
    ctx.app.innerHTML = `<section class="card"><div class="eyebrow">News</div><div class="gauge-name">Rhein-News</div><div class="gauge-meta">Gefilterte Treffer aus der bisherigen Wächter-Suche</div></section>${items.length ? items.map(item => `<article class="card nfb-item compact-link-card"><h3>${ctx.esc(item.title)}</h3><p>${ctx.esc(item.summary || '')}</p>${Array.isArray(item.matched_terms) && item.matched_terms.length ? `<p class="gauge-meta">Suchbegriffe: ${ctx.esc(item.matched_terms.join(', '))}</p>` : ''}${item.link ? `<a class="action-icon" href="${ctx.esc(item.link)}" target="_blank" rel="noopener" aria-label="Beitrag öffnen"></a>` : ''}</article>`).join('') : '<div class="empty">Noch keine neuen Treffer im neuen Testsystem.</div>'}`;
  } catch (error) {
    ctx.errorView('News', error);
  }
}
