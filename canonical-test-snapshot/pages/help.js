export function renderHelp(ctx) {
  ctx.activate('hilfe');
  ctx.app.innerHTML = `<section class="card"><div class="eyebrow">Hilfe</div><div class="gauge-name">R(h)einschiffer Hilfe</div><p class="help-copy">Pegel auswählen, Wasserstand und Verlauf prüfen und – sofern vorhanden – die amtliche Vorhersage öffnen. NfB zeigt schifffahrtsrelevante Meldungen.</p><p class="help-copy">Diese Hilfeseite liegt in einer eigenen Datei und kann unabhängig von Pegel, Vorhersage oder Navigation geändert werden.</p></section>`;
}
