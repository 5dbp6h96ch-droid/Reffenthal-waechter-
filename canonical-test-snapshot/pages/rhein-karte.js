import { marinasWithKm } from '../data/marinas.js';

const KM_REFS = [
  [166.0,47.558,7.588],[228.0,48.022,7.563],[291.0,48.587,7.768],
  [362.327,49.038977,8.305564],[400.610,49.323807,8.448705],[424.733,49.483940,8.455165],
  [443.370,49.631837,8.377519],[498.270,50.003995,8.275319],[528.360,49.970342,7.899668],
  [546.230,50.085438,7.764962],[591.490,50.358640,7.604741],[654.800,50.736398,7.108045],
  [688.0,50.960,6.790],[814.0,51.646143,6.606820],[862.0,51.849827,6.112447],
];

function kmToLatLon(km){
  if(km<=KM_REFS[0][0])return KM_REFS[0].slice(1);
  const last=KM_REFS.at(-1); if(km>=last[0])return last.slice(1);
  for(let i=0;i<KM_REFS.length-1;i++){
    const [k0,lat0,lon0]=KM_REFS[i], [k1,lat1,lon1]=KM_REFS[i+1];
    if(km>=k0&&km<=k1){const t=(km-k0)/(k1-k0);return [lat0+t*(lat1-lat0),lon0+t*(lon1-lon0)];}
  }
  return KM_REFS[0].slice(1);
}

async function ensureLeaflet(){
  if(window.L)return window.L;
  if(!document.querySelector('link[data-leaflet]')){
    const link=document.createElement('link');link.rel='stylesheet';link.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';link.dataset.leaflet='1';document.head.appendChild(link);
  }
  await new Promise((resolve,reject)=>{
    const existing=document.querySelector('script[data-leaflet]');
    if(existing){existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',reject,{once:true});return;}
    const s=document.createElement('script');s.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';s.dataset.leaflet='1';s.onload=resolve;s.onerror=reject;document.head.appendChild(s);
  });
  return window.L;
}

function roundMarker(L,{symbol,bg='#0b79e5',size=30,fontSize=15}){
  return L.divIcon({
    className:'',
    html:`<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};color:white;border:2px solid white;box-shadow:0 2px 7px rgba(0,0,0,.28);display:grid;place-items:center;font-size:${fontSize}px;font-weight:800;line-height:1;">${symbol}</div>`,
    iconSize:[size,size],iconAnchor:[size/2,size/2],popupAnchor:[0,-(size/2+2)],
  });
}

function marinaIcon(L){return roundMarker(L,{symbol:'⚓',bg:'#0b79e5',fontSize:15});}
function fuelIcon(L){return roundMarker(L,{symbol:'⛽',bg:'#e58b14',fontSize:15});}
function gaugeIcon(L){return roundMarker(L,{symbol:'≋',bg:'#168a9e',fontSize:22});}
function nfbIcon(L){return roundMarker(L,{symbol:'!',bg:'#6b7280',size:26,fontSize:16});}

function marinaFuelIcon(L){
  return L.divIcon({
    className:'',
    html:'<div style="display:flex;align-items:center;filter:drop-shadow(0 2px 5px rgba(0,0,0,.25));"><span style="width:29px;height:29px;border-radius:50%;background:#0b79e5;color:#fff;border:2px solid #fff;display:grid;place-items:center;font-size:14px;">⚓</span><span style="width:29px;height:29px;margin-left:-5px;border-radius:50%;background:#e58b14;color:#fff;border:2px solid #fff;display:grid;place-items:center;font-size:14px;">⛽</span></div>',
    iconSize:[53,29],iconAnchor:[26,15],popupAnchor:[0,-18],
  });
}

function formatPrice(ctx,value,unit){
  const n=Number(value);
  return Number.isFinite(n)&&n>0?`${n.toLocaleString('de-DE',{minimumFractionDigits:3,maximumFractionDigits:3})} ${ctx.esc(unit||'€/l')}`:'—';
}

function stationPopup(ctx,s){
  const km=Number.isFinite(Number(s.river_km))?`<br>Rhein-km ${ctx.fmtKm(s.river_km)}`:'';
  const fuelBits=[];
  if(Number(s.has_petrol)===1||Number(s.petrol)>0) fuelBits.push(`Benzin: ${formatPrice(ctx,s.petrol,s.unit)}`);
  if(Number(s.has_diesel)===1||Number(s.diesel)>0) fuelBits.push(`Diesel: ${formatPrice(ctx,s.diesel,s.unit)}`);
  if(Number(s.waste_pumpout)===1) fuelBits.push('Fäkalienabsaugung');
  if(Number(s.potable_water)===1) fuelBits.push('Trinkwasser');
  const details=fuelBits.length?`<br>${fuelBits.map(ctx.esc).join('<br>')}`:'';
  const notes=s.notes?`<br><span style="color:#667085">${ctx.esc(s.notes)}</span>`:'';
  const web=s.url?`<br><a href="${ctx.esc(s.url)}" target="_blank" rel="noopener">Webseite öffnen</a>`:'';
  return `<strong>${ctx.esc(s.name)}</strong><br><strong>⛽ Tankstelle</strong>${km}${details}${notes}${web}`;
}

function marinaPopup(ctx,m,s){
  const web=m.website?`<br><a href="${ctx.esc(m.website)}" target="_blank" rel="noopener">Webseite öffnen</a>`:'';
  const extra=m.details?`<br><span style="color:#667085">${ctx.esc(m.details)}</span>`:'';
  const station=s?`<br><br>${stationPopup(ctx,s)}`:'';
  return `<strong>${ctx.esc(m.name)}</strong><br>⚓ Marina<br>${ctx.esc(m.ort)}<br>Rhein-km ${ctx.esc(m.rheinKm.toFixed(1).replace('.',','))}${extra}${web}${station}`;
}

function sameLocation(a,b){
  if(a.id&&b.id&&a.id===b.id)return true;
  const latA=Number(a.lat??a.latitude), lonA=Number(a.lon??a.longitude);
  const latB=Number(b.lat??b.latitude), lonB=Number(b.lon??b.longitude);
  return [latA,lonA,latB,lonB].every(Number.isFinite)&&Math.abs(latA-latB)<0.00035&&Math.abs(lonA-lonB)<0.00035;
}

export async function renderRheinKarte(ctx) {
  ctx.activate('rhein-karte');
  ctx.loading('Rhein-Karte');
  try{
    const [gaugesData,nfbData,stationsData]=await Promise.all([
      ctx.api('/api/gauges'),
      ctx.api('/api/nfb').catch(()=>({meldungen:[]})),
      ctx.api('/api/tankstellen').catch(()=>({stations:[]})),
    ]);
    const marinas=marinasWithKm();
    const stations=(stationsData.stations||[]).filter(s=>Number.isFinite(Number(s.latitude))&&Number.isFinite(Number(s.longitude)));

    ctx.app.innerHTML=`
      <section class="card">
        <div class="eyebrow">Rhein-Karte</div>
        <div class="gauge-name">Rhein-Karte</div>
        <div class="gauge-meta">Alle Pegel · alle verfügbaren Tankstellen · Marinas · NfB</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;font-size:12px;color:#667085;">
          <span>⚓ Marina</span><span>⛽ Tankstelle</span><span>≋ Pegel</span><span>! NfB</span>
        </div>
      </section>
      <section class="card map-card"><div class="map-wrap"><div id="rhein-map" class="rhein-map"></div><button id="map-fullscreen-open" class="map-expand-control" type="button" aria-label="Karte im Vollbild öffnen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/></svg></button></div></section>`;

    const L=await ensureLeaflet();
    const map=L.map('rhein-map').setView([49.42,8.45],10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
    L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png',{maxZoom:18,opacity:.85,attribution:'© OpenSeaMap'}).addTo(map);

    for(const g of gaugesData.gauges||[]){
      if(!Number.isFinite(Number(g.latitude))||!Number.isFinite(Number(g.longitude)))continue;
      L.marker([g.latitude,g.longitude],{icon:gaugeIcon(L)}).addTo(map).bindPopup(`<strong>${ctx.esc(g.name)}</strong><br>≋ Pegel<br>Rhein-km ${ctx.fmtKm(g.river_km)}<br><a href="#/pegel">Pegel öffnen</a>`);
    }

    const matchedStations=new Set();
    for(const m of marinas){
      const station=stations.find(s=>sameLocation(m,s));
      if(station)matchedStations.add(station.id);
      L.marker([m.lat,m.lon],{icon:station?marinaFuelIcon(L):marinaIcon(L)}).addTo(map).bindPopup(marinaPopup(ctx,m,station));
    }

    for(const s of stations){
      if(matchedStations.has(s.id))continue;
      L.marker([Number(s.latitude),Number(s.longitude)],{icon:fuelIcon(L)}).addTo(map).bindPopup(stationPopup(ctx,s));
    }

    for(const m of nfbData.meldungen||[]){
      const km=Number(m.river_km_from??m.km_von);
      if(!Number.isFinite(km))continue;
      const p=kmToLatLon(km);
      L.marker(p,{icon:nfbIcon(L)}).addTo(map).bindPopup(`<strong>NfB</strong><br>${ctx.esc(m.title||m.titel||'Meldung')}<br>Rhein-km ${ctx.fmtKm(km)}`);
    }

    const openFullscreen=()=>{
      if(document.querySelector('.map-fullscreen-overlay'))return;
      const overlay=document.createElement('div');
      overlay.className='map-fullscreen-overlay';
      overlay.innerHTML='<button class="map-fullscreen-close" type="button" aria-label="Vollbildkarte schließen">×</button><div id="rhein-map-fullscreen" class="rhein-map-fullscreen"></div>';
      document.body.appendChild(overlay);
      document.body.classList.add('fullscreen-open');
      const fullMap=L.map('rhein-map-fullscreen').setView(map.getCenter(),map.getZoom());
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(fullMap);
      L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png',{maxZoom:18,opacity:.85,attribution:'© OpenSeaMap'}).addTo(fullMap);
      map.eachLayer(layer=>{
        if(layer instanceof L.Marker){
          const marker=L.marker(layer.getLatLng(),{icon:layer.options.icon}).addTo(fullMap);
          const popup=layer.getPopup();
          if(popup)marker.bindPopup(popup.getContent());
        }
      });
      setTimeout(()=>fullMap.invalidateSize(),0);
      const close=()=>{fullMap.remove();overlay.remove();document.body.classList.remove('fullscreen-open');document.removeEventListener('keydown',onKey)};
      const onKey=e=>{if(e.key==='Escape')close()};
      overlay.querySelector('.map-fullscreen-close')?.addEventListener('click',close);
      document.addEventListener('keydown',onKey);
    };
    document.querySelector('#map-fullscreen-open')?.addEventListener('click',openFullscreen);
  }catch(e){ctx.errorView('Rhein-Karte',e)}
}
