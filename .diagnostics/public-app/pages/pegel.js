export async function renderPegelPage(ctx) {
  const { app, state, api, esc, fmtKm, fmtDate, ensureGauges, menuRows, activate, loading, errorView, isAuthenticated } = ctx;
  activate('pegel');
  loading('Pegel');

  const fullDate = value => value ? new Date(value).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
  const timeOnly = value => value ? new Date(value).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '—';
  const relativeTime = value => {
    if (!value) return 'Nie';
    const diffMs = Date.now() - new Date(value).getTime();
    const diffMin = Math.max(0, Math.floor(diffMs / 60000));
    if (diffMin < 1) return 'Gerade eben';
    if (diffMin < 60) return `vor ${diffMin} Min.`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `vor ${diffH} Std.`;
    const diffD = Math.floor(diffH / 24);
    return `vor ${diffD} Tag${diffD === 1 ? '' : 'en'}`;
  };
  const axisDate = value => new Date(value).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  const niceStep = raw => {
    const power = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
    const fraction = raw / power;
    const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
    return nice * power;
  };
  const historyChart = (source, threshold) => {
    const data = (source || [])
      .map(r => ({ measured_at: r.measured_at, value_cm: Number(r.value_cm) }))
      .filter(r => r.measured_at && Number.isFinite(r.value_cm))
      .sort((a,b) => new Date(a.measured_at) - new Date(b.measured_at));
    if (data.length < 2) return '<div class="empty">Keine Verlaufsdaten verfügbar.</div>';

    const sampleStep = Math.max(1, Math.floor(data.length / 240));
    const pts = data.filter((_, i) => i % sampleStep === 0);
    if (pts.at(-1)?.measured_at !== data.at(-1)?.measured_at) pts.push(data.at(-1));

    const values = pts.map(p => p.value_cm);
    const rawMin = Math.min(...values, Number(threshold));
    const rawMax = Math.max(...values, Number(threshold));
    const spread = Math.max(20, rawMax - rawMin);
    const yStep = niceStep(spread / 4);
    const yMin = Math.floor((rawMin - yStep * .65) / yStep) * yStep;
    const yMax = Math.ceil((rawMax + yStep * .65) / yStep) * yStep;

    const w = 680, h = 340, left = 58, right = 18, top = 48, bottom = 54;
    const plotW = w - left - right, plotH = h - top - bottom;
    const firstMs = new Date(pts[0].measured_at).getTime();
    const lastMs = new Date(pts.at(-1).measured_at).getTime();
    const spanMs = Math.max(1, lastMs - firstMs);
    const x = t => left + ((new Date(t).getTime() - firstMs) / spanMs) * plotW;
    const y = v => top + ((yMax - v) / Math.max(1, yMax - yMin)) * plotH;

    const yTicks = [];
    for (let v = yMin; v <= yMax + yStep / 2; v += yStep) yTicks.push(v);
    const xTickCount = 5;
    const xTicks = Array.from({ length: xTickCount }, (_, i) => {
      const ms = firstMs + (spanMs * i / (xTickCount - 1));
      return { ms, x: left + plotW * i / (xTickCount - 1) };
    });

    const segments = [];
    const line = (x1,y1,x2,y2,color) => `<line class="history-line" x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="${color}"/>`;
    const red = '#ff3b30', green = '#31c96b';
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i-1], b = pts[i];
      const ax = x(a.measured_at), ay = y(a.value_cm), bx = x(b.measured_at), by = y(b.value_cm);
      const aSafe = a.value_cm >= threshold, bSafe = b.value_cm >= threshold;
      if (aSafe === bSafe) {
        segments.push(line(ax, ay, bx, by, aSafe ? green : red));
      } else {
        const ratio = (threshold - a.value_cm) / (b.value_cm - a.value_cm);
        const cx = ax + (bx - ax) * ratio;
        const cy = y(threshold);
        segments.push(line(ax, ay, cx, cy, aSafe ? green : red));
        segments.push(line(cx, cy, bx, by, bSafe ? green : red));
      }
    }

    const latest = pts.at(-1);
    const latestColor = latest.value_cm >= threshold ? green : red;
    const areaPath = `M ${x(pts[0].measured_at).toFixed(2)} ${y(pts[0].value_cm).toFixed(2)} ` + pts.slice(1).map(p => `L ${x(p.measured_at).toFixed(2)} ${y(p.value_cm).toFixed(2)}`).join(' ') + ` L ${x(latest.measured_at).toFixed(2)} ${(top+plotH).toFixed(2)} L ${x(pts[0].measured_at).toFixed(2)} ${(top+plotH).toFixed(2)} Z`;

    const yGrid = yTicks.map(v => `<line class="history-grid" x1="${left}" y1="${y(v)}" x2="${w-right}" y2="${y(v)}"/><text class="history-y-label" x="${left-10}" y="${y(v)+4}" text-anchor="end">${Math.round(v)}</text>`).join('');
    const xGrid = xTicks.map((t,i) => `<line class="history-grid history-grid-x" x1="${t.x}" y1="${top}" x2="${t.x}" y2="${top+plotH}"/><text class="history-x-label" x="${t.x}" y="${h-24}" text-anchor="${i===0?'start':i===xTickCount-1?'end':'middle'}">${axisDate(t.ms)}</text>`).join('');
    const thresholdY = y(Number(threshold));

    return `<svg class="history-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Pegelverlauf mit Warnschwelle">
      <defs><linearGradient id="historyArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${latestColor}" stop-opacity=".18"/><stop offset="100%" stop-color="${latestColor}" stop-opacity="0"/></linearGradient></defs>
      <text class="history-axis-title" x="${left}" y="22">Pegel (cm)</text>
      ${yGrid}${xGrid}
      <path d="${areaPath}" fill="url(#historyArea)"/>
      <line class="history-threshold" x1="${left}" y1="${thresholdY}" x2="${w-right}" y2="${thresholdY}"/>
      <text class="history-threshold-label" x="${w-right}" y="${Math.max(top+12,thresholdY-8)}" text-anchor="end">Schwelle ${Math.round(threshold)} cm</text>
      ${segments.join('')}
      <circle class="history-point-halo" cx="${x(latest.measured_at)}" cy="${y(latest.value_cm)}" r="10" fill="${latestColor}"/>
      <circle class="history-point" cx="${x(latest.measured_at)}" cy="${y(latest.value_cm)}" r="5" fill="${latestColor}"/>
      <text class="history-axis-title history-axis-bottom" x="${left+plotW/2}" y="${h-3}" text-anchor="middle">Datum</text>
    </svg>`;
  };

  try {
    await ensureGauges();
    if (!state.selected) throw new Error('Keine Rheinpegel verfügbar.');

    if (!isAuthenticated()) {
      const guestGauge = state.gauges.find(g=>g.name?.toLowerCase()==='speyer') || state.selected;
      const d = await api(`/api/gauges/${encodeURIComponent(guestGauge.id)}/readings?days=1`);
      const readings = d.readings || [];
      const latest = [...readings].sort((a,b)=>new Date(a.measured_at)-new Date(b.measured_at)).at(-1) || null;
      app.innerHTML = `<section class="card"><div class="gauge-head"><div><div class="eyebrow">Pegelstand</div><div class="gauge-name">${esc(guestGauge.name)}</div><div class="gauge-meta">Rhein-km ${fmtKm(guestGauge.river_km)} · ${fmtDate(latest?.measured_at)}</div></div><div class="level">${latest?.value_cm ?? '—'} <small>cm</small></div></div></section><section class="card"><div class="eyebrow">Konto</div><div class="gauge-name">Weitere Funktionen nach Anmeldung</div><p class="help-copy">Melde dich an, um Vorhersage, NfB, Tankstellen, Clubs, Rhein-Karte, News, Wächter, Einstellungen und weitere Funktionen zu nutzen.</p><a class="menu-row" href="#/konto"><span>Anmelden oder registrieren</span><span>›</span></a></section>`;
      return;
    }

    const d = await api(`/api/gauges/${encodeURIComponent(state.selected.id)}/readings?days=${state.days}`);
    const readings = d.readings || [];
    const orderedReadings = [...readings].sort((a,b)=>new Date(a.measured_at)-new Date(b.measured_at));
    const latest = orderedReadings.at(-1) || null;
    const previous = latest ? [...orderedReadings].reverse().find(r => new Date(r.measured_at).getTime() < new Date(latest.measured_at).getTime()) || null : null;
    const currentCm = latest?.value_cm == null ? null : Number(latest.value_cm);
    const previousCm = previous?.value_cm == null ? null : Number(previous.value_cm);
    const trend = Number.isFinite(currentCm) && Number.isFinite(previousCm) ? Math.round(currentCm - previousCm) : null;
    const alarm = Number.isFinite(currentCm) && currentCm < Number(state.threshold);
    const safe = Number.isFinite(currentCm) && currentCm >= Number(state.threshold);
    const statusLabel = alarm ? 'ALARM' : safe ? 'SICHER' : '';
    const trendLabel = trend == null ? '' : trend > 0 ? `↑ +${trend} cm` : trend < 0 ? `↓ ${trend} cm` : '→ 0 cm';

    app.innerHTML = `<section class="pegel-live-card"><div class="pegel-live-head"><div class="pegel-live-name">${esc(state.selected.name).toUpperCase()}</div>${statusLabel ? `<div class="pegel-status ${alarm ? 'alarm' : 'safe'}">${statusLabel}</div>` : ''}</div><div class="pegel-live-meta">RHEINKILOMETER ${fmtKm(state.selected.river_km)}${latest?.measured_at ? ` · ${fullDate(latest.measured_at)} · ${timeOnly(latest.measured_at)}` : ''}</div><div class="pegel-live-value">${latest?.value_cm ?? '—'}${latest?.value_cm != null ? '<small>cm</small>' : ''}</div>${trendLabel ? `<div class="pegel-trend">${trendLabel}</div>` : ''}${latest?.measured_at ? `<div class="pegel-live-sub">Letzte Messung: ${relativeTime(latest.measured_at)}</div>` : ''}<div class="pegel-live-sub">Schwelle: ${state.threshold} cm</div></section><section class="card history-card"><div class="history-head"><div class="eyebrow">Pegelverlauf</div><div class="range history-range">${[7,15,31].map(n => `<button data-days="${n}" class="${state.days===n?'active':''}">${n} T</button>`).join('')}</div></div>${historyChart(readings,state.threshold)}</section><div class="section-title">Menü</div>${menuRows()}`;
    document.querySelectorAll('[data-days]').forEach(b => b.addEventListener('click', () => { state.days = Number(b.dataset.days); renderPegelPage(ctx); }));
  } catch (e) {
    errorView('Pegel', e);
  }
}
