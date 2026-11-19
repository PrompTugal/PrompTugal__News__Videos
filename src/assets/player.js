// The click-to-load player: the page shows YouTube's preview image (built into the page from i.ytimg.com);
// when the reader presses play or clicks the image, one iframe from YouTube's privacy-enhanced host,
// built only from an 11-character id, replaces the image.
// videos.b@PrompTugal.dinis, 18 November 2026. Code: Apache-2.0.
(function () {
  'use strict';
  var HOST = 'https://www.youtube-nocookie.com';
  var ID = /^[A-Za-z0-9_-]{11}$/;
  function start(n) { n = parseInt(n, 10); return isFinite(n) && n > 0 && n < 86400 ? Math.floor(n) : 0; }
  function load(box, at) {
    var id = box.getAttribute('data-yt') || '';
    if (!ID.test(id)) return;
    var s = start(at != null ? at : box.getAttribute('data-start'));
    var f = document.createElement('iframe');
    f.src = HOST + '/embed/' + id + '?autoplay=1&rel=0' + (s ? '&start=' + s : '');
    f.title = (box.getAttribute('data-title') || 'Video') + ' (YouTube player)';
    f.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen');
    f.setAttribute('allowfullscreen', '');
    f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-popups');
    f.className = 'frame';
    var screen = box.querySelector('.screen') || box;
    var old = screen.querySelector('iframe');
    if (old) old.remove();
    var img = screen.querySelector('img.poster');
    if (img) img.remove();
    var btn = box.querySelector('button.play');
    if (btn) btn.remove();
    box.classList.add('loaded');
    screen.insertBefore(f, screen.firstChild);
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('button.play, button.seek, .player img.poster') : null;
    if (!t) return;
    if (!t.classList.contains('seek')) { load(t.closest('.player')); return; }
    var box = document.querySelector('.player[data-yt]');
    if (box) { load(box, t.getAttribute('data-start')); box.scrollIntoView({ block: 'start' }); }
  });
})();
