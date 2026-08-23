export async function renderTankstelle(ctx) {
  ctx.activate('tankstelle');
  ctx.loading('Tankstelle');
  try {
    const [data,prefs] = await Promise.all([ctx.api('/api/tankstellen'),ctx.api('/api/preferences/sources')]);
    const enabled = new Set((prefs.fuel_stations||[]).filter(x=>x.enabled).map(x=>x.id));
    const stations = (data.stations||[]).filter(x=>enabled.has(x.id));
    if (!stations.length) {
      ctx.app.innerHTML = `<section class="card"><div class="eyebrow">Tankstellen</div><div class="gauge-name">Keine Tankstelle ausgewählt</div><p class="help-copy">Wähle deine Tankstellen unter Einstellungen → Preferences aus.</p></section>`;
      return;
    }
    const price = (v,unit) => Number.isFinite(Number(v)) && Number(v)>0 ? `${Number(v).toLocaleString('de-DE',{minimumFractionDigits:3,maximumFractionDigits:3})} ${ctx.esc(unit || '€/l')}` : null;
    const stand = (s) => {
      const sourceDate = String(s.source_date || '').trim();
      if (/^\d{2}\.\d{2}\.\d{4}$/.test(sourceDate)) return sourceDate;
      return sourceDate || s.checked_at ? ctx.fmtDate(sourceDate || s.checked_at) : '—';
    };
    const km = (s) => Number.isFinite(Number(s.river_km)) ? `Rhein-km ${Number(s.river_km).toLocaleString('de-DE',{minimumFractionDigits:1,maximumFractionDigits:2})}` : '';
    const fuelValue = (s,key,hasKey) => {
      const p=price(s[key],s.unit);
      if(p) return p;
      return Number(s[hasKey])===1 ? 'verfügbar' : '—';
    };
    ctx.app.innerHTML = `<section class="card"><div class="eyebrow">Tankstellen</div><div class="gauge-name">Meine Tankstellen</div><div class="gauge-meta">${stations.length} ausgewählte Quelle${stations.length===1?'':'n'}</div></section>${stations.map(s=>`<article class="card nfb-item"><h3>${ctx.esc(s.name)}</h3>${km(s)?`<div class="gauge-meta">${km(s)}</div>`:''}<div class="settings-row"><span>Benzin</span><strong>${fuelValue(s,'petrol','has_petrol')}</strong></div><div class="settings-row"><span>Diesel</span><strong>${fuelValue(s,'diesel','has_diesel')}</strong></div>${price(s.petrol,s.unit)||price(s.diesel,s.unit)?`<div class="settings-row"><span>Stand</span><span>${stand(s)}</span></div>`:''}</article>`).join('')}`;
  } catch (e) {
    ctx.errorView('Tankstellen', e);
  }
}
