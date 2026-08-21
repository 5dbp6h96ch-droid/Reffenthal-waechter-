import { marinasWithKm } from '../data/marinas.js';

export async function renderClubs(ctx) {
  ctx.activate('clubs');
  ctx.loading('Clubs');

  try {
    const marinas = marinasWithKm();
    const rows = marinas.map((m) => `
      <tr>
        <td style="padding:8px 8px;border-bottom:1px solid var(--line,#d9e5ee);white-space:nowrap;vertical-align:middle;font-variant-numeric:tabular-nums;">${ctx.esc(m.rheinKm.toFixed(1).replace('.', ','))}</td>
        <td style="padding:8px 8px;border-bottom:1px solid var(--line,#d9e5ee);vertical-align:middle;font-weight:700;">${ctx.esc(m.name)}</td>
        <td class="action-cell" style="border-bottom:1px solid var(--line,#d9e5ee);">
          <button type="button" class="action-icon" data-marina-open="${ctx.esc(m.id)}" aria-label="Details zu ${ctx.esc(m.name)} öffnen" aria-expanded="false"></button>
        </td>
      </tr>
      <tr data-marina-detail-row="${ctx.esc(m.id)}" hidden>
        <td colspan="3" style="padding:0 8px 14px;border-bottom:1px solid var(--line,#d9e5ee);">
          <div style="background:#f6fbff;border:1px solid #d9eaf8;border-radius:14px;padding:12px 14px;display:grid;gap:7px;position:relative;">
            <div><strong>${ctx.esc(m.name)}</strong></div>
            <div style="color:#667085;">Ort: ${ctx.esc(m.ort || '—')}</div>
            <div style="color:#667085;">Rhein-km: ${ctx.esc(m.rheinKm.toFixed(1).replace('.', ','))}</div>
            ${m.details ? `<div>${ctx.esc(m.details)}</div>` : ''}
            ${m.website ? `<a class="action-icon" style="position:absolute;top:10px;right:10px" href="${ctx.esc(m.website)}" target="_blank" rel="noopener" aria-label="Webseite von ${ctx.esc(m.name)} öffnen"></a>` : ''}
          </div>
        </td>
      </tr>`).join('');

    ctx.app.innerHTML = `
      <section class="card">
        <div class="eyebrow">Clubs</div>
        <div class="gauge-name">Marinas am Rhein</div>
        <div class="gauge-meta">${marinas.length} Marinas · Rhein-km · Clubname · Details</div>
      </section>
      <section class="card" style="padding:0;overflow:hidden;">
        <div style="overflow-x:auto;">
          <table class="marina-table" style="width:100%;border-collapse:collapse;table-layout:auto;">
            <thead>
              <tr>
                <th style="padding:9px 8px;text-align:left;font-size:12px;color:#667085;background:#f6fbff;white-space:nowrap;">Rhein-km</th>
                <th style="padding:9px 8px;text-align:left;font-size:12px;color:#667085;background:#f6fbff;">Club / Marina</th>
                <th style="padding:9px 7px;text-align:right;font-size:12px;color:#667085;background:#f6fbff;white-space:nowrap;"></th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </section>`;

    for (const button of ctx.app.querySelectorAll('[data-marina-open]')) {
      button.addEventListener('click', () => {
        const id = button.getAttribute('data-marina-open');
        const row = ctx.app.querySelector(`[data-marina-detail-row="${CSS.escape(id)}"]`);
        if (!row) return;
        const willOpen = row.hidden;
        row.hidden = !willOpen;
        button.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        button.setAttribute('aria-label', `${willOpen ? 'Details schließen' : 'Details öffnen'}`);
      });
    }
  } catch (e) {
    ctx.errorView('Clubs', e);
  }
}
