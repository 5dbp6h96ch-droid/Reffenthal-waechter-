function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}

async function getPushState() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return { supported: false, subscription: null };
  const reg = await navigator.serviceWorker.register('/sw.js');
  const subscription = await reg.pushManager.getSubscription();
  return { supported: true, reg, subscription };
}

function sourceRows(items,type){
  if(!items.length) return '<div class="empty">Keine Quellen vorhanden.</div>';
  return items.map(item=>`<label class="settings-row"><span>${item.name}</span><input class="source-toggle" type="checkbox" data-type="${type}" data-id="${item.id}" ${item.enabled?'checked':''}></label>`).join('');
}

function restoreClose(ctx){
  if (document.querySelector('.page-close-bar')) return;
  ctx.app.insertAdjacentHTML('afterbegin','<div class="page-close-bar"><a class="page-close" href="#/pegel?menu=1" aria-label="Schließen und zum Menü zurückkehren">×</a></div>');
}

export async function renderSettings(ctx) {
  ctx.activate('einstellungen');
  await ctx.ensureGauges();
  const [push,sources] = await Promise.all([
    getPushState().catch(() => ({ supported: false, subscription: null })),
    ctx.api('/api/preferences/sources').catch(()=>({fuel_stations:[]})),
  ]);
  const currentThreshold = Number(ctx.state.threshold || 225);

  ctx.app.innerHTML = `
    <section class="card">
      <div class="eyebrow">Einstellungen</div>
      <div class="gauge-name">Persönliche Einstellungen</div>

      <label class="settings-row" style="display:block">
        <span>Ausgewählter Pegel</span>
        <div style="margin-top:8px">${ctx.gaugeSelect()}</div>
      </label>

      <label class="settings-row" style="display:block">
        <span>Warnschwelle in cm</span>
        <input id="threshold-input" class="control" type="number" min="0" max="1500" step="1" value="${currentThreshold}" style="margin-top:8px">
      </label>

      <div class="settings-row"><span>Push-Nachrichten</span><strong>${!push.supported ? 'Nicht unterstützt' : push.subscription ? 'Aktiv' : 'Inaktiv'}</strong></div>
      ${push.supported ? `<button id="push-toggle" class="control" type="button">${push.subscription ? 'Push deaktivieren' : 'Push aktivieren'}</button>` : ''}
      <div id="settings-status" class="gauge-meta" style="margin-top:10px"></div>
    </section>

    <section class="card">
      <div class="eyebrow">Preferences</div>
      <div class="gauge-name">Tankstellen</div>
      <p class="gauge-meta">Neue Tankstellen können später zentral ergänzt und hier individuell gewählt werden.</p>
      ${sourceRows(sources.fuel_stations||[],'fuel_station')}
    </section>`;

  ctx.bindGaugeSelect(async () => { await renderSettings(ctx); restoreClose(ctx); });

  document.querySelector('#threshold-input')?.addEventListener('change', async event => {
    const status = document.querySelector('#settings-status');
    const value = Math.max(0, Math.min(1500, Number(event.target.value) || 225));
    ctx.state.threshold = value;
    localStorage.setItem('threshold_cm', String(value));
    try { await ctx.savePersistentSettings(); status.textContent = 'Warnschwelle gespeichert.'; }
    catch (error) { status.textContent = error.message || String(error); }
  });

  document.querySelectorAll('.source-toggle').forEach(el=>el.addEventListener('change',async event=>{
    const status=document.querySelector('#settings-status');
    try{
      await ctx.api('/api/preferences/sources',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({source_type:event.target.dataset.type,source_id:event.target.dataset.id,enabled:event.target.checked})});
      status.textContent='Quellenauswahl gespeichert.';
    }catch(error){event.target.checked=!event.target.checked;status.textContent=error.message||String(error);}
  }));

  document.querySelector('#push-toggle')?.addEventListener('click', async () => {
    const status = document.querySelector('#settings-status');
    status.textContent = 'Push-Einstellung wird aktualisiert…';
    try {
      const state = await getPushState();
      if (state.subscription) {
        await ctx.api('/api/push/unsubscribe', { method: 'POST', headers: { 'content-type':'application/json' }, body: JSON.stringify({ endpoint: state.subscription.endpoint }) });
        await state.subscription.unsubscribe();
        await ctx.savePersistentSettings({ push_enabled: false });
        await renderSettings(ctx); restoreClose(ctx); return;
      }
      const keyData = await ctx.api('/api/push/vapid-public-key');
      if (!keyData.publicKey) throw new Error('Push ist serverseitig noch nicht konfiguriert.');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Benachrichtigungen wurden nicht erlaubt.');
      const subscription = await state.reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(keyData.publicKey) });
      await ctx.api('/api/push/subscribe', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({subscription:subscription.toJSON(),selectedGaugeId:ctx.state.selected?.id??null,thresholdCm:ctx.state.threshold}) });
      await ctx.savePersistentSettings({ push_enabled: true });
      await renderSettings(ctx); restoreClose(ctx); return;
    } catch (error) { status.textContent = error.message || String(error); }
  });
}
