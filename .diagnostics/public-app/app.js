import { renderStartPage } from './pages/start.js';
import { renderPegelPage } from './pages/pegel.js';
import { renderForecastPage } from './pages/vorhersage.js';
import { renderNfbPage } from './pages/nfb.js';
import { renderTankstelle } from './pages/tankstelle.js';
import { renderClubs } from './pages/clubs.js';
import { renderRheinKarte } from './pages/rhein-karte.js';
import { renderNews } from './pages/news.js';
import { renderWaechter } from './pages/waechter.js';
import { renderHelp } from './pages/help.js';
import { renderSettings } from './pages/settings.js';
import { renderKonto } from './pages/konto.js';
import { renderForgotPassword, renderResetPassword } from './pages/passwort.js';

const app=document.querySelector('#app');
const bottomNav=document.querySelector('.bottom-nav');
const nav=[...document.querySelectorAll('[data-route]')];
const state={gauges:[],selected:null,days:7,threshold:225,settingsLoaded:false,pushEnabled:false,nfbEnabled:true,newsEnabled:true,user:null,authLoaded:false};
function getDeviceId(){let id=localStorage.getItem('rheinschiffer_device_id');if(!id){id=crypto.randomUUID().replace(/-/g,'');localStorage.setItem('rheinschiffer_device_id',id)}return id}
const api=async(path,options={})=>{const headers=new Headers(options.headers||{});if(!headers.has('accept'))headers.set('accept','application/json');headers.set('x-rheinschiffer-device-id',getDeviceId());const r=await fetch(path,{...options,headers});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);return d};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const fmtKm=v=>Number.isFinite(Number(v))?Number(v).toLocaleString('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1}):'—';
const fmtDate=v=>v?new Date(v).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
function route(){return(location.hash.replace(/^#\//,'')||'pegel').split('?')[0]}
function activate(name){nav.forEach(a=>a.classList.toggle('active',a.dataset.route===name))}
function loading(title){app.innerHTML=`<section class="card"><div class="eyebrow">${esc(title)}</div><div class="empty">Daten werden geladen…</div></section>`}
function errorView(title,e){app.innerHTML=`<section class="card"><div class="eyebrow">${esc(title)}</div><div class="error">${esc(e.message)}</div></section>`}
async function refreshAuth(){try{const me=await api('/api/auth/me');state.user=me.user||null}catch{state.user=null}state.authLoaded=true;if(bottomNav)bottomNav.style.display=state.user?'':'none';return state.user}
function isAuthenticated(){return Boolean(state.user)}
async function loadPersistentSettings(){if(state.settingsLoaded)return;try{const settings=await api('/api/settings');if(Number.isFinite(Number(settings.threshold_cm)))state.threshold=Number(settings.threshold_cm);if(settings.selected_gauge_id)localStorage.setItem('selected_gauge_id',settings.selected_gauge_id);state.pushEnabled=Boolean(settings.push_enabled);state.nfbEnabled=settings.nfb_enabled!==false;state.newsEnabled=settings.news_enabled!==false}catch{const localThreshold=Number(localStorage.getItem('threshold_cm'));if(Number.isFinite(localThreshold))state.threshold=localThreshold}state.settingsLoaded=true}
async function savePersistentSettings(patch={}){if('push_enabled'in patch)state.pushEnabled=Boolean(patch.push_enabled);if('nfb_enabled'in patch)state.nfbEnabled=Boolean(patch.nfb_enabled);if('news_enabled'in patch)state.newsEnabled=Boolean(patch.news_enabled);await api('/api/settings',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({selected_gauge_id:state.selected?.id??null,threshold_cm:state.threshold,push_enabled:state.pushEnabled,nfb_enabled:state.nfbEnabled,news_enabled:state.newsEnabled})})}
async function ensureGauges(){if(state.gauges.length)return;if(isAuthenticated())await loadPersistentSettings();const d=await api('/api/gauges');state.gauges=d.gauges||[];const stored=isAuthenticated()?localStorage.getItem('selected_gauge_id'):null;state.selected=state.gauges.find(g=>g.id===stored)||state.gauges.find(g=>g.name?.toLowerCase()==='speyer')||state.gauges[0]||null}
function gaugeSelect(){return `<select id="gauge-select" class="control" aria-label="Pegel auswählen">${state.gauges.map(g=>`<option value="${esc(g.id)}" ${state.selected?.id===g.id?'selected':''}>${esc(g.name)} · Rhein-km ${fmtKm(g.river_km)}</option>`).join('')}</select>`}
function bindGaugeSelect(next){document.querySelector('#gauge-select')?.addEventListener('change',async e=>{state.selected=state.gauges.find(g=>g.id===e.target.value)||null;if(state.selected)localStorage.setItem('selected_gauge_id',state.selected.id);try{await savePersistentSettings()}catch{}next()})}
function lineChart(readings,threshold){if(!readings||readings.length<2)return'<div class="empty">Keine Verlaufsdaten verfügbar.</div>';const data=[...readings].sort((a,b)=>new Date(a.measured_at)-new Date(b.measured_at));const step=Math.max(1,Math.floor(data.length/180));const pts=data.filter((_,i)=>i%step===0);const values=pts.map(x=>x.value_cm);const min=Math.min(...values,threshold)-10,max=Math.max(...values,threshold)+10,w=680,h=210,p=24;const x=i=>p+(i/(pts.length-1||1))*(w-p*2),y=v=>h-p-((v-min)/(max-min||1))*(h-p*2);const path=pts.map((d,i)=>`${i?'L':'M'}${x(i).toFixed(1)} ${y(d.value_cm).toFixed(1)}`).join(' ');return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Pegelverlauf"><line class="chart-grid" x1="${p}" y1="${p}" x2="${p}" y2="${h-p}"/><line class="chart-grid" x1="${p}" y1="${h-p}" x2="${w-p}" y2="${h-p}"/><line class="chart-threshold" x1="${p}" y1="${y(threshold)}" x2="${w-p}" y2="${y(threshold)}"/><path class="chart-line" d="${path}"/><text class="chart-label" x="${p+4}" y="${Math.max(12,y(threshold)-5)}">Schwelle ${threshold} cm</text><text class="chart-label" x="${p}" y="${h-5}">${fmtDate(pts[0].measured_at)}</text><text class="chart-label" text-anchor="end" x="${w-p}" y="${h-5}">${fmtDate(pts.at(-1).measured_at)}</text></svg>`}
function menuIcon(type){const icons={
  forecast:'<svg viewBox="0 0 24 24"><path d="M3 17l5-5 4 3 7-8"/><path d="M14 7h5v5"/></svg>',
  nfb:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v5"/><path d="M12 16h.01"/></svg>',
  fuel:'<svg viewBox="0 0 24 24"><path d="M12 3c3.2 4 6 7.1 6 10.5a6 6 0 0 1-12 0C6 10.1 8.8 7 12 3z"/><path d="M9.5 15.5c.8 1 1.7 1.5 2.8 1.5"/></svg>',
  clubs:'<svg viewBox="0 0 24 24"><circle cx="12" cy="6" r="2"/><path d="M12 8v10"/><path d="M7 11h10"/><path d="M6 15c1.5 2 3.5 3 6 3s4.5-1 6-3"/></svg>',
  map:'<svg viewBox="0 0 24 24"><path d="M3 6l5-2 8 3 5-2v13l-5 2-8-3-5 2z"/><path d="M8 4v13"/><path d="M16 7v13"/></svg>',
  news:'<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 9h8"/><path d="M8 13h8"/><path d="M8 17h5"/></svg>',
  watch:'<svg viewBox="0 0 24 24"><path d="M6 15h12l-1.5-2v-3a4.5 4.5 0 0 0-9 0v3z"/><path d="M10 18a2 2 0 0 0 4 0"/></svg>',
  account:'<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3"/><path d="M6 20v-2a6 6 0 0 1 12 0v2"/></svg>',
  help:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M9.8 9.5a2.4 2.4 0 0 1 4.6.8c0 1.8-2.4 2-2.4 3.8"/><path d="M12 17h.01"/></svg>',
  settings:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a7 7 0 0 0-1.8-1L14.4 3h-4.8L9.3 6a7 7 0 0 0-1.8 1L5.1 6 3 9.5 5 11a7 7 0 0 0 0 2l-2 1.5L5.1 18l2.4-1a7 7 0 0 0 1.8 1l.3 3h4.8l.3-3a7 7 0 0 0 1.8-1l2.4 1 2-3.5-2-1.5c.1-.3.1-.7.1-1z"/></svg>'
};return `<span class="menu-icon" aria-hidden="true">${icons[type]||icons.help}</span>`}
function menuRow(href,label,icon){return `<a class="menu-row" href="${href}">${menuIcon(icon)}<span class="menu-label">${label}</span><span class="menu-chevron" aria-hidden="true">›</span></a>`}
function menuRows(){return `<div id="menu" class="menu-list">${menuRow('#/vorhersage','Vorhersage','forecast')}${menuRow('#/nfb','WSV – Nachrichten','nfb')}${menuRow('#/tankstelle','Tankstelle','fuel')}${menuRow('#/clubs','Clubs','clubs')}${menuRow('#/rhein-karte','Karte','map')}${menuRow('#/news','News','news')}${menuRow('#/waechter','Wächter','watch')}${menuRow('#/konto','Konto','account')}${menuRow('#/hilfe','Hilfe','help')}${menuRow('#/einstellungen','Einstellungen','settings')}</div>`}
function addCloseNavigation(r){const noClose=new Set(['pegel','start','passwort-vergessen','passwort-zuruecksetzen']);if(noClose.has(r)||!isAuthenticated())return;const bar=document.createElement('div');bar.className='page-close-bar';bar.innerHTML='<a class="page-close" href="#/pegel?menu=1" aria-label="Schließen und zum Menü zurückkehren">×</a>';app.prepend(bar)}
function scrollToMenuIfRequested(){if(route()!=='pegel')return;const params=new URLSearchParams((location.hash.split('?')[1]||''));if(params.get('menu')!=='1')return;requestAnimationFrame(()=>requestAnimationFrame(()=>document.querySelector('#menu')?.scrollIntoView({behavior:'smooth',block:'start'})))}
const ctx={app,state,api,esc,fmtKm,fmtDate,ensureGauges,gaugeSelect,bindGaugeSelect,lineChart,menuRows,activate,loading,errorView,savePersistentSettings,refreshAuth,isAuthenticated};
async function render(){if(!state.authLoaded)await refreshAuth();const r=route();const publicAuthRoutes=new Set(['konto','passwort-vergessen','passwort-zuruecksetzen']);if(!isAuthenticated()&&!publicAuthRoutes.has(r)&&r!=='pegel'){if(location.hash!=='#/pegel'){location.hash='#/pegel';return}}let result;if(r==='start')result=await renderStartPage(ctx);else if(r==='vorhersage')result=await renderForecastPage(ctx);else if(r==='nfb')result=await renderNfbPage(ctx);else if(r==='tankstelle')result=await renderTankstelle(ctx);else if(r==='clubs')result=await renderClubs(ctx);else if(r==='rhein-karte')result=await renderRheinKarte(ctx);else if(r==='news')result=await renderNews(ctx);else if(r==='waechter')result=await renderWaechter(ctx);else if(r==='konto')result=await renderKonto(ctx);else if(r==='passwort-vergessen')result=await renderForgotPassword(ctx);else if(r==='passwort-zuruecksetzen')result=await renderResetPassword(ctx);else if(r==='hilfe')result=await renderHelp(ctx);else if(r==='einstellungen')result=await renderSettings(ctx);else result=await renderPegelPage(ctx);addCloseNavigation(r);scrollToMenuIfRequested();return result}
const initialRoute=route();
if(initialRoute!=='passwort-zuruecksetzen'&&location.hash!=='#/pegel')history.replaceState(null,'',`${location.pathname}${location.search}#/pegel`);
window.addEventListener('hashchange',render);render();
