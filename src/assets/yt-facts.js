// Data in the browser (Dinis Cruz, 19 Nov 2026, about 01:13 UTC): on a YouTube video's page, YouTube's own time published
// and length, read at page open from data.b@'s feed on data.promptugal.news. One fixed address; no cookies, no referrer, no
// redirects, no cache; a size cap before JSON.parse; every value checked and shown only as numbers and fixed words through
// textContent, never as the feed's own strings. Stale, future-dated, expired or malformed data shows the built fallback, or
// "may be out of date". YouTube is credited and its terms linked beside the figures, as its API terms ask.
// videos.b@PrompTugal.dinis, 21 Nov 2026. Code: Apache-2.0.
(function () {
  'use strict';
  var FEED = 'https://data.promptugal.news/api/v1/youtube-replays/latest.json';
  var FEED_PAGE = 'https://data.promptugal.news/';
  var YT_TERMS = 'https://www.youtube.com/t/terms';
  var YT_SITE = 'https://www.youtube.com/';
  var MAX_BYTES = 262144, MAX_VIDEOS = 2000, SKEW_MS = 300000;
  var ID = /^[A-Za-z0-9_-]{11}$/;
  var STAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/;
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function stamp(s) {
    if (typeof s !== 'string') return null;
    var m = STAMP.exec(s);
    if (!m) return null;
    var t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    return isFinite(t) && new Date(t).toISOString().slice(0, 19) + 'Z' === s ? t : null;
  }
  function two(n) { return (n < 10 ? '0' : '') + n; }
  function day(t) { var d = new Date(t); return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); }
  function clock(t) { var d = new Date(t); return day(t) + ', ' + two(d.getUTCHours()) + ':' + two(d.getUTCMinutes()) + ' UTC'; }
  function length(s) {
    var h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60;
    return (h ? h + ' h ' : '') + (h || m ? m + ' min ' : '') + x + ' s';
  }
  function a(href, text) {
    var e = document.createElement('a');
    e.href = href;
    e.rel = 'noopener noreferrer nofollow';
    e.referrerPolicy = 'no-referrer';
    e.textContent = text;
    return e;
  }
  function t(s) { return document.createTextNode(s); }

  // The whole feed is checked before anything is shown; any failure returns null and the fallback stays.
  function check(d, id, now) {
    if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
    var read = stamp(d.data_read_at);
    if (read === null || read > now + SKEW_MS) return null;
    var c = d.expected_cadence;
    var staleAfter = c && typeof c === 'object' ? c.stale_after_seconds : null;
    if (typeof staleAfter !== 'number' || !isFinite(staleAfter) || staleAfter < 60 || staleAfter > 2592000 || Math.floor(staleAfter) !== staleAfter) return null;
    var by = stamp(d.delete_or_refresh_by);
    // past YouTube's 30-day limit, or a limit set further than 31 days from the read: not shown at all
    if (by === null || now > by || by > read + 2678400000) return null;
    if (!Array.isArray(d.videos) || d.videos.length > MAX_VIDEOS) return null;
    var hit = null;
    for (var i = 0; i < d.videos.length; i++) {
      var v = d.videos[i];
      if (v && typeof v === 'object' && v.id === id) { if (hit) return null; hit = v; }
    }
    if (!hit) return { read: read, stale: now - read > staleAfter * 1000, missing: true };
    var pub = stamp(hit.published_at);
    var len = hit.duration_seconds;
    if (pub === null || pub > read + SKEW_MS) return null;
    if (typeof len !== 'number' || !isFinite(len) || len < 0 || len > 172800 || Math.floor(len) !== len) return null;
    return { read: read, stale: now - read > staleAfter * 1000, published: pub, seconds: len };
  }

  function show(box, f) {
    var out = box.querySelector('.yt-facts-out');
    if (!out) return;
    var p = document.createElement('p');
    if (f.missing) {
      p.appendChild(t('data.b@\'s feed of YouTube facts, read ' + clock(f.read) + ', does not list this video. The date on the card above is as it was found.'));
    } else {
      var dl = document.createElement('dl');
      dl.className = 'facts big';
      var rows = [['Published on YouTube', clock(f.published)], ['Length', length(f.seconds)]];
      for (var i = 0; i < rows.length; i++) {
        var dt = document.createElement('dt'); dt.textContent = rows[i][0];
        var dd = document.createElement('dd'); dd.textContent = rows[i][1];
        dl.appendChild(dt); dl.appendChild(dd);
      }
      out.replaceChildren(dl);
      p.appendChild(t('Source: YouTube ('));
      p.appendChild(a(YT_SITE, 'youtube.com'));
      p.appendChild(t('), under the '));
      p.appendChild(a(YT_TERMS, 'YouTube Terms of Service'));
      p.appendChild(t('. Read from YouTube\'s Data API by data.b@ at ' + clock(f.read) + ' and loaded in your browser from '));
      p.appendChild(a(FEED_PAGE, 'data.promptugal.news'));
      p.appendChild(t('; nothing is kept here.'));
      p.className = 'small';
      out.appendChild(p);
      if (f.stale) { var s = document.createElement('p'); s.className = 'note'; s.textContent = 'These facts may be out of date: the feed has not been read again on time.'; out.appendChild(s); }
      return;
    }
    p.className = 'small';
    out.replaceChildren(p);
    if (f.stale) { var s2 = document.createElement('p'); s2.className = 'note'; s2.textContent = 'The feed may be out of date: it has not been read again on time.'; out.appendChild(s2); }
  }

  function run() {
    var box = document.querySelector('.yt-facts[data-yt-id]');
    if (!box || typeof fetch !== 'function') return;
    var id = box.getAttribute('data-yt-id') || '';
    if (!ID.test(id)) return;
    fetch(FEED, { method: 'GET', mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('status');
        var n = Number(r.headers.get('content-length') || 0);
        if (n > MAX_BYTES || !r.body || typeof r.body.getReader !== 'function') throw new Error('too large');
        // Read the body in chunks and stop as soon as it passes the cap, so a hostile feed cannot fill the tab's memory.
        var reader = r.body.getReader(), parts = [], total = 0;
        function pump() {
          return reader.read().then(function (x) {
            if (x.done) return parts;
            total += x.value.byteLength;
            if (total > MAX_BYTES) { reader.cancel(); throw new Error('too large'); }
            parts.push(x.value);
            return pump();
          });
        }
        return pump();
      })
      .then(function (chunks) {
        var buf = new Uint8Array(MAX_BYTES), at = 0;
        for (var i = 0; i < chunks.length; i++) { buf.set(chunks[i], at); at += chunks[i].byteLength; }
        var s = new TextDecoder('utf-8', { fatal: true }).decode(buf.subarray(0, at));
        var f = check(JSON.parse(s), id, Date.now());
        if (f) show(box, f);
      })
      .catch(function () { /* the built fallback stays */ });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
