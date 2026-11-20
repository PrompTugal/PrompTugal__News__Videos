// Draws the shared map (ptmap, vendored and pinned) from the places the build wrote into data-places. No network, no
// inline script: the values are parsed with JSON.parse, only id, name, position and link are passed on, and ptmap itself
// checks every link and number again. videos.b@PrompTugal.dinis, 20 Nov 2026. Code: Apache-2.0.
(function () {
  'use strict';
  var el = document.getElementById('ptmap');
  if (!el || !window.PTMap || typeof window.PTMap.render !== 'function') return;
  var raw;
  try { raw = JSON.parse(el.getAttribute('data-places') || '[]'); } catch (e) { return; }
  if (!Array.isArray(raw)) return;
  var places = raw.filter(function (x) {
    return x && typeof x.id === 'string' && typeof x.name === 'string' && typeof x.href === 'string' && Array.isArray(x.at) && x.at.length === 2;
  }).map(function (x) { return { id: x.id, name: x.name, at: [Number(x.at[0]), Number(x.at[1])], href: x.href }; });
  var opts = { places: places, label: el.getAttribute('data-label') || 'Places' };
  var cur = el.getAttribute('data-current');
  if (cur) opts.current = cur;
  window.PTMap.render(el, opts);
})();
