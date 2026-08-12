/**
 * sw-diag.js – Service-Worker-Volldiagnose + iOS-sicherer Controller-Fix
 *
 * Wird vom CI ausschließlich in test/index.html eingebettet (nie in Produktion).
 *
 * Root Cause iOS Safari:
 *   clients.claim() triggert kein controllerchange Event für die aktive Seite.
 *   Fix: nach SW.ready direkt controller prüfen und bei null sofort reload.
 *
 * Diagnose-Overlay zeigt:
 *   registration / scope / scriptURL
 *   active / waiting / installing / controller
 *   controller === active
 *   controllerchange fired
 *   pageshow.persisted (BFCache)
 *   location / ready
 */
(function () {
  'use strict';

  var LOG = '[SW-Diag]';

  /* ── Diagnose-State ────────────────────────────────────────────────────── */
  var state = {
    controllerchangeFired: false,
    pageshoePersisted:     false,
    readyResolved:         false,
    updateResult:         '–',
    reloaded:             false,
  };

  /* ── BFCache-Tracking ──────────────────────────────────────────────────── */
  window.addEventListener('pageshow', function (e) {
    state.pageshoePersisted = e.persisted;
    if (e.persisted) {
      console.log(LOG, 'BFCache-Restore (pageshow.persisted=true) → Reload');
      sessionStorage.removeItem('sw-diag-rl');
      window.location.reload(true);
    }
  });

  if (!('serviceWorker' in navigator)) {
    renderStatic('serviceWorker API nicht verfügbar');
    return;
  }
  var SW = navigator.serviceWorker;

  /* ── Anti-Reload-Loop ──────────────────────────────────────────────────── */
  var RELOAD_KEY = 'sw-diag-rl';
  state.reloaded = !!sessionStorage.getItem(RELOAD_KEY);

  function safeReload(reason) {
    if (state.reloaded) {
      console.log(LOG, 'Reload bereits erfolgt – kein weiterer Reload (' + reason + ')');
      renderDiag(null);
      return;
    }
    console.log(LOG, 'Reload (' + reason + ')');
    sessionStorage.setItem(RELOAD_KEY, reason);
    state.reloaded = true;
    window.location.reload(true);
  }

  /* ── controllerchange ──────────────────────────────────────────────────── */
  SW.addEventListener('controllerchange', function () {
    state.controllerchangeFired = true;
    console.log(LOG, 'controllerchange → safeReload');
    safeReload('controllerchange');
  });

  /* ── SW_UPDATED postMessage ────────────────────────────────────────────── */
  SW.addEventListener('message', function (e) {
    if (e && e.data && e.data.type === 'SW_UPDATED') {
      console.log(LOG, 'SW_UPDATED postMessage → safeReload');
      safeReload('SW_UPDATED');
    }
  });

  /* ── SW registrieren + update() ────────────────────────────────────────── */
  var SW_URL   = '/Reffenthal-waechter-/sw.js';
  var SW_SCOPE = '/Reffenthal-waechter-/';

  function ensureRegistration() {
    return SW.register(SW_URL, { scope: SW_SCOPE })
      .then(function (reg) {
        reg.update()
          .then(function ()  { state.updateResult = 'ok'; })
          .catch(function (e){ state.updateResult = 'err: ' + e; });
        return reg;
      });
  }

  /* ── Bundle-Name aus DOM ───────────────────────────────────────────────── */
  function bundleName() {
    var tags = document.querySelectorAll('script[src]');
    for (var i = 0; i < tags.length; i++) {
      if (tags[i].src.indexOf('_expo') !== -1) return tags[i].src.split('/').pop();
    }
    return '–';
  }

  /* ── Diagnose-Overlay ──────────────────────────────────────────────────── */
  function strip(url) {
    return url ? url.replace('https://5dbp6h96ch-droid.github.io', '') : '–';
  }

  function renderOverlay(lines) {
    var existing = document.getElementById('sw-diag');
    if (existing) existing.remove();
    var div = document.createElement('div');
    div.id = 'sw-diag';
    div.setAttribute('style',
      'position:fixed;top:0;left:0;right:0;' +
      'background:rgba(8,24,28,0.97);color:#c8eaf0;' +
      'font:9px/1.7 monospace;padding:5px 8px;' +
      'z-index:2147483647;pointer-events:none;' +
      'word-break:break-all;border-bottom:2px solid #2a7a8a');
    div.innerHTML = lines.map(function(l){ return '🔧 '+l; }).join('<br>');
    if (document.body) document.body.appendChild(div);
  }

  function renderStatic(msg) {
    if (document.body) renderOverlay([msg]);
    else document.addEventListener('DOMContentLoaded', function(){ renderOverlay([msg]); });
  }

  function renderDiag(reg) {
    var ctrl   = SW.controller;
    var active = reg ? reg.active   : null;
    var bundle = bundleName();

    var ctrlURL   = ctrl   ? strip(ctrl.scriptURL)   : '<span style="color:#f66">⚠ NONE</span>';
    var activeURL = active ? strip(active.scriptURL) + ' (' + active.state + ')' : '<span style="color:#f66">none</span>';
    var ctrlEqAct = ctrl && active ? (ctrl.scriptURL === active.scriptURL ? '✅ ja' : '❌ nein') : '–';

    var lines = [
      'location:          ' + strip(location.href),
      'registration:      ' + (reg ? 'vorhanden' : '<span style="color:#f66">FEHLT</span>'),
      'scope:             ' + (reg ? strip(reg.scope) : '–'),
      'scriptURL:         ' + (reg ? strip(reg.active ? reg.active.scriptURL : SW_URL) : SW_URL),
      'active:            ' + activeURL,
      'waiting:           ' + (reg && reg.waiting    ? strip(reg.waiting.scriptURL)    + ' (' + reg.waiting.state    + ')' : 'none'),
      'installing:        ' + (reg && reg.installing ? strip(reg.installing.scriptURL) + ' (' + reg.installing.state + ')' : 'none'),
      'controller:        ' + ctrlURL,
      'ctrl === active:   ' + ctrlEqAct,
      'ready:             ' + (state.readyResolved ? '✅ resolved' : '⏳ pending'),
      'update() result:   ' + state.updateResult,
      'controllerchange:  ' + (state.controllerchangeFired ? '✅ gefeuert' : '❌ nie gefeuert'),
      'pageshow.persisted:' + (state.pageshoePersisted ? '⚠ ja (BFCache)' : 'nein'),
      'reloaded:          ' + (state.reloaded ? sessionStorage.getItem(RELOAD_KEY) || 'ja' : 'nein'),
      'bundle:            ' + bundle,
    ];

    if (window.caches) {
      caches.keys().then(function(names){
        lines.push('caches:            ' + (names.length ? names.join(' | ') : '(leer)'));
        renderOverlay(lines);
      }).catch(function(){ renderOverlay(lines); });
    } else {
      renderOverlay(lines);
    }
  }

  /* ── Hauptlogik ─────────────────────────────────────────────────────────── */
  function start() {
    // Sofortige Erstdarstellung mit vorhandenen Daten
    renderDiag(null);

    ensureRegistration()
      .then(function (reg) {
        renderDiag(reg);

        SW.ready
          .then(function (readyReg) {
            state.readyResolved = true;
            renderDiag(readyReg);

            /* ─── iOS SAFARI FIX ─────────────────────────────────────────
               clients.claim() auf iOS Safari triggert KEIN controllerchange
               Event für die bereits geöffnete Seite. Daher: nach SW.ready
               explizit prüfen ob controller gesetzt ist. Falls nicht → reload.
               Das ist die einzig zuverlässige Methode für iOS Safari.
            ──────────────────────────────────────────────────────────────── */
            if (!SW.controller) {
              console.log(LOG, 'SW.ready resolved aber controller=null → iOS-Fix: safeReload');
              safeReload('ready-no-controller');
            }
          })
          .catch(function (err) {
            renderOverlay(['SW.ready Fehler: ' + err]);
          });
      })
      .catch(function (err) {
        renderOverlay([
          'Registration Fehler: ' + err,
          'bundle: ' + bundleName(),
        ]);
      });
  }

  if (document.body) {
    start();
  } else {
    document.addEventListener('DOMContentLoaded', start);
  }

  // Nachladen nach React-Mount
  setTimeout(function () {
    SW.ready.then(function(r){ state.readyResolved=true; renderDiag(r); }).catch(function(){});
  }, 1500);
  setTimeout(function () {
    SW.ready.then(function(r){ state.readyResolved=true; renderDiag(r); }).catch(function(){});
  }, 4000);
})();
