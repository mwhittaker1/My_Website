// Lets a link carry the address of the test server, e.g.  .../hearth_test/?api=https://something.trycloudflare.com
// The address is remembered in this browser, after the visitor confirms it. Classic script: it must run before the page reads its settings.
// Only free-tunnel addresses are accepted, and the visitor sees the exact address first, because the
// submissions viewer sends its password to whatever server the pages are connected to.
(function () {
  try {
    var q = new URLSearchParams(location.search).get("api");
    if (!q) return;
    history.replaceState(null, "", location.pathname + location.hash);
    var u = q.trim().replace(/\/+$/, "");
    if (!/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(u)) {
      alert("That server address isn't one these test pages accept, so it was ignored.");
      return;
    }
    var ov = {};
    try { ov = JSON.parse(localStorage.getItem("hs-admin-settings")) || {}; } catch (e) {}
    var api = u + "/api"; // the test server serves its API under /api
    if (ov.apiBase === api) return;
    if (confirm("This link wants to connect the test pages to this server:\n\n" + u + "\n\nOnly continue if Mickey or Sam sent you this link.")) {
      ov.apiBase = api;
      localStorage.setItem("hs-admin-settings", JSON.stringify(ov));
    }
  } catch (e) { /* storage blocked: the pages just stay in snapshot mode */ }
})();
