/**
 * sw-diag.js – Service-Worker-Volldiagnose + iOS-sicherer Reload-Mechanismus
 *
 * Wird vom CI ausschließlich in test/index.html eingebettet (nie in Produktion).
 *
 * Diagnose-Overlay zeigt:
 *   SW scope / scriptURL / registration state
 *   SW active / waiting / installing
 *   navigator.serviceWorker.controller
 *   pageshow.persisted (BFCache-Detektion)
 *   geladenes JS-Bundle
 *   alle Cache-Namen
 *
 * Reload-Mechanismen (anti-loop via sessionStorage):
 *   1. controllerchange-Event  (primär, iOS-sicher)
 *   2. SW_UPDATED postMessage  (Fallback vom SW activate-Handler)
 *   3. BFCache pageshow reload (iOS Safari BFCache-Restore)
 */
(function () {
  'use strict';
  if (!('serviceWorker' in navigator)) {
    renderStatic('serviceWorker API nicht verfügbar');
    return;
  }
  var SW = navigator.serviceWorker;

  /* ── Anti-Loop ─────────────────────────────────────────────────────────── */
  // sessionStorage wird beim Tab-Schließen gelöscht → beim nächsten Öffnen
  // greift der Reload wieder falls ein weiteres SW-Update wartet.
  var RELOAD_KEY = 'sw-diag-reloaded';
  function safeReload(reason) {
    if (sessionStorage.getItem(RELOAD_KEY)) {
      console.log('[SW-Diag] Reload bereits erfolgt, überspringe (' + reason + ')');
      renderDiag();
      return;
    }
    console.log('[SW-Diag] Reload (' + reason + ')');
    sessionStorage.setItem(RELOAD_KEY, '1');
    window.location.reload(true);
  }

  /* ── BFCache-Detektion ─────────────────────────────────────────────────── */
  // iOS Safari stellt Seiten aus dem BFCache wieder her ohne einen echten Load.
  // In diesem Fall feuern weder load noch DOMContentLoaded, aber pageshow feuert.
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) {
      console.log('[SW-Diag] BFCache-Restore (pageshow.persisted=true) → Reload');
      sessionStorage.removeItem(RELOAD_KEY); // reset: frischer Reload erlaubt
      window.location.reload(true);
    }
  });

  /* ── Reload-Mechanismen ────────────────────────────────────────────────── */
  SW.addEventListener('controllerchange', function () {
    safeReload('controllerchange');
  });

  SW.addEventListener('message', function (e) {
    if (e && e.data && e.data.type === 'SW_UPDATED') {
      safeReload('SW_UPDATED postMessage');
    }
  });

  /* ── SW registrieren / update() ────────────────────────────────────────── */
  // Falls noch kein SW registriert: jetzt registrieren.
  // Falls bereits registriert: update() explizit prüfen ob neue Version verfügbar.
  var SW_URL   = '/Reffenthal-waechter-/sw.js';
  var SW_SCOPE = '/Reffenthal-waechter-/';

  function ensureRegistration() {
    return SW.register(SW_URL, { scope: SW_SCOPE })
      .then(function (reg) {
        // Explizit nach Update prüfen (unabhängig vom 24h-Browser-Intervall)
        reg.update().catch(function () {});
        return reg;
      });
  }

  /* ── Diagnose-Overlay ──────────────────────────────────────────────────── */
  var BUNDLE_TAG = '–';
  var scripts = document.querySelectorAll('script[src]');
  for (var i = 0; i < scripts.length; i++) {
    if (scripts[i].src.indexOf('_expo') !== -1) {
      BUNDLE_TAG = scripts[i].src.split('/').pop();
      break;
    }
  }

  function el(tag, style, html) {
    var e = document.createElement(tag);
    if (style) e.setAttribute('style', style);
    if (html)  e.innerHTML = html;
    return e;
  }

  function renderLines(lines) {
    return lines.map(function (l) { return '🔧 ' + l; }).join('<br>');
  }

  function renderOverlay(lines) {
    var existing = document.getElementById('sw-diag');
    if (existing) existing.remove();
    var div = el('div',
      'position:fixed;bottom:62px;left:0;right:0;' +
      'background:rgba(10,30,35,0.96);color:#d0eef2;' +
      'font:9.5px/1.65 monospace;padding:6px 10px;' +
      'z-index:2147483647;pointer-events:none;' +
      'word-break:break-all;' +
      'border-top:1px solid rgba(255,255,255,0.12)',
      renderLines(lines)
    );
    div.id = 'sw-diag';
    document.body.appendChild(div);
  }

  function renderStatic(msg) {
    if (document.body) {
      renderOverlay([msg]);
    } else {
      document.addEventListener('DOMContentLoaded', function () { renderOverlay([msg]); });
    }
  }

  function renderDiag(reg) {
    var ctrl = SW.controller;
    var reloaded = sessionStorage.getItem(RELOAD_KEY) ? 'ja' : 'nein';

    var lines = [
      'controller: ' + (ctrl
        ? ctrl.scriptURL.replace('https://5dbp6h96ch-droid.github.io', '')
        : '<span style="color:#f77">⚠ NONE</span>'),
      'bundle:     ' + BUNDLE_TAG,
      'bfcache-reload: ' + reloaded,
    ];

    if (reg) {
      lines.splice(1, 0,
        'scope:      ' + reg.scope.replace('https://5dbp6h96ch-droid.github.io', ''),
        'active:     ' + (reg.active
          ? reg.active.scriptURL.replace('https://5dbp6h96ch-droid.github.io', '') +
            ' (' + reg.active.state + ')'
          : '<span style="color:#f77">none</span>'),
        'waiting:    ' + (reg.waiting
          ? reg.waiting.scriptURL.replace('https://5dbp6h96ch-droid.github.io', '') +
            ' (' + reg.waiting.state + ')'
          : 'none'),
        'installing: ' + (reg.installing
          ? reg.installing.scriptURL.replace('https://5dbp6h96ch-droid.github.io', '') +
            ' (' + reg.installing.state + ')'
          : 'none')
      );
    } else {
      lines.splice(1, 0, 'registration: <span style="color:#f77">nicht verfügbar</span>');
    }

    if (window.caches) {
      caches.keys().then(function (names) {
        lines.push('caches:     ' + (names.length ? names.join(' | ') : '(leer)'));
        renderOverlay(lines);
      }).catch(function () { renderOverlay(lines); });
    } else {
      renderOverlay(lines);
    }
  }

  /* ── Start ─────────────────────────────────────────────────────────────── */
  function start() {
    // Sofort mit vorhandenen Daten rendern (controller könnte schon gesetzt sein)
    renderDiag(null);

    ensureRegistration()
      .then(function (reg) {
        renderDiag(reg);
        // Nach SW.ready: SW ist aktiv → finale Diagnose
        SW.ready.then(function (readyReg) {
          renderDiag(readyReg);
        }).catch(function (err) {
          renderOverlay(['SW.ready Fehler: ' + err]);
        });
      })
      .catch(function (err) {
        renderOverlay(['Registration Fehler: ' + err, 'bundle: ' + BUNDLE_TAG]);
      });
  }

  if (document.body) {
    start();
  } else {
    document.addEventListener('DOMContentLoaded', start);
  }
  // Nachladerender nach React-Mount (falls Body erst später bereit)
  setTimeout(function () {
    SW.ready.then(renderDiag).catch(function () {});
  }, 1500);
  setTimeout(function () {
    SW.ready.then(renderDiag).catch(function () {});
  }, 4000);
})();
