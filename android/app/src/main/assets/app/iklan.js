// Oru Studio: buang iklan YouTube di WebView.
// 1) data iklan dihapus dari respons pemutar (adPlacements, playerAds, adSlots)
// 2) bila iklan tetap tampil: lewati/percepat, dan beri tahu aplikasi (rekaman ditahan)
(function () {
  if (window.__oruIklan) return;
  window.__oruIklan = 1;
  var KUNCI = ["adPlacements", "playerAds", "adSlots", "adBreakHeartbeatParams"];
  function bersih(o) {
    try {
      if (o && typeof o === "object") {
        for (var i = 0; i < KUNCI.length; i++) if (KUNCI[i] in o) delete o[KUNCI[i]];
        if (o.playerResponse) bersih(o.playerResponse);
        if (Array.isArray(o)) o.forEach(bersih);
      }
    } catch (e) {}
    return o;
  }
  var jp = JSON.parse;
  JSON.parse = function () { return bersih(jp.apply(this, arguments)); };
  if (window.Response) {
    var rj = Response.prototype.json;
    Response.prototype.json = function () { return rj.apply(this, arguments).then(bersih); };
  }
  try {
    var ipr;
    Object.defineProperty(window, "ytInitialPlayerResponse", {
      configurable: true,
      get: function () { return ipr; },
      set: function (v) { ipr = bersih(v); }
    });
  } catch (e) {}

  var lalu = false;
  setInterval(function () {
    var ada = !!document.querySelector(".ad-showing, .ad-interrupting");
    var v = document.querySelector("video");
    if (ada) {
      document.querySelectorAll(".ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button").forEach(function (b) { b.click(); });
      if (v && isFinite(v.duration) && v.duration > 0) { v.muted = true; v.currentTime = v.duration; }
    } else if (lalu && v) {
      v.muted = false;
    }
    if (ada !== lalu) {
      lalu = ada;
      try { Oru.iklan(ada); } catch (e) {}
    }
  }, 250);
})();
