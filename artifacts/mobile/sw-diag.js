/**
 * sw-diag.js – Service-Worker-Diagnose + iOS-sicherer Reload-Mechanismus
 *
 * Wird vom CI ausschließlich in test/index.html eingebettet (nie in Produktion).
 *
 * Zwei Mechanismen für den SW-Update-Reload:
 *   1. controllerchange-Event  (primär, iOS-sicher)
 *   2. SW_UPDATED postMessage  (Fallback, falls controllerchange zu früh feuert)
 *
 * Das Diagnosefenster zeigt:
 *   - SW active / waiting / installing
 *   - navigator.serviceWorker.controller
 *   - geladenes JS-Bundle
 *   - alle Cache-Namen (inkl. rheinschiffer-*)
 */
(function () {
  'use strict';
  var SW = navigator.serviceWorker;
  if (!SW) return;

  /* ── 1. iOS-sicherer Reload-Mechanismus ───────────────────────────────── */

  // controllerchange: feuert wenn neuer SW via skipWaiting() + clients.claim()
  // die Kontrolle übernimmt. Das ist der von Google Workbox empfohlene Weg.
  SW.addEventListener('controllerchange', function () {
    console.log('[SW-Diag] controllerchange erkannt → window.location.reload(true)');
    window.location.reload(true);
  });

  // SW_UPDATED postMessage: Fallback, den der neue SW im activate-Handler sendet.
  SW.addEventListener('message', function (e) {
    if (e && e.data && e.data.type === 'SW_UPDATED') {
      console.log('[SW-Diag] SW_UPDATED postMessage empfangen → window.location.reload(true)');
      window.location.reload(true);
    }
  });

  /* ── 2. DOM-sichtbare Diagnose ────────────────────────────────────────── */

  function renderDiag() {
    var existing = document.getElementById('sw-diag');
    if (existing) existing.remove();

    var ctrl   = SW.controller;
    var bundle = '–';
    var scripts = document.querySelectorAll('script[src]');
    for (var i = 0; i < scripts.length; i++) {
      if (scripts[i].src.indexOf('_expo') !== -1) {
        bundle = scripts[i].src.split('/').pop();
        break;
      }
    }

    var el = document.createElement('div');
    el.id = 'sw-diag';
    el.setAttribute('style', [
      'position:fixed',
      'bottom:62px',
      'left:0',
      'right:0',
      'background:rgba(20,61,69,0.95)',
      'color:#e2f4f7',
      'font:10px/1.6 monospace',
      'padding:6px 10px',
      'z-index:2147483647',
      'pointer-events:none',
      'word-break:break-all',
      'border-top:1px solid rgba(255,255,255,0.15)'
    ].join(';'));

    function buildHtml(lines) {
      return lines.map(function (l) { return '🔧 ' + l; }).join('<br>');
    }

    function populate(reg) {
      var lines = [
        'active:     ' + (reg.active     ? reg.active.scriptURL.split('/').pop()     : '<span style="color:#f88">none</span>'),
        'waiting:    ' + (reg.waiting    ? reg.waiting.scriptURL.split('/').pop()    : 'none'),
        'installing: ' + (reg.installing ? reg.installing.scriptURL.split('/').pop() : 'none'),
        'controller: ' + (ctrl           ? ctrl.scriptURL.split('/').pop()           : '<span style="color:#f88">⚠ NONE</span>'),
        'bundle:     ' + bundle,
      ];
      if (window.caches) {
        caches.keys().then(function (names) {
          lines.push('caches:     ' + (names.length ? names.join(' | ') : '(leer)'));
          el.innerHTML = buildHtml(lines);
        });
      } else {
        el.innerHTML = buildHtml(lines);
      }
    }

    el.innerHTML = buildHtml(['controller: ' + (ctrl ? ctrl.scriptURL.split('/').pop() : '⚠ NONE'), 'bundle: ' + bundle, '…']);

    SW.ready.then(populate).catch(function (err) {
      el.innerHTML = buildHtml(['SW.ready Fehler: ' + err]);
    });

    document.body.appendChild(el);
  }

  function tryRender() {
    if (document.body) {
      renderDiag();
    } else {
      document.addEventListener('DOMContentLoaded', renderDiag);
    }
  }

  tryRender();
  // Wiederhole nach React-Mount und nach erstem vollständigem Render
  setTimeout(renderDiag, 800);
  setTimeout(renderDiag, 2500);
})();
