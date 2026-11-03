// Customer comments on the menu: shows approved comments on each product, and lets visitors send a new one.
// New comments are emailed to the bakery and stay hidden until the owner approves them (at /test_comments/).
// Needs the test server (settings.apiBase). Without it, the comment buttons simply don't appear.
// Everything a visitor wrote is put on the page as plain text, never as HTML.
const HS = window.HS;
const $ = (id) => document.getElementById(id);

const base = () => String(HS.settings().apiBase || "").trim().replace(/\/+$/, "");
const when = (iso) => new Date(iso).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" });

function el(tag, text, cls) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}

/* ---------- Approved comments on the product cards ---------- */
let cache = { key: "", at: 0, data: {} };

async function approvedFor(ids) {
  const key = ids.join(",");
  if (cache.key === key && Date.now() - cache.at < 15000) return cache.data;
  try {
    const res = await fetch(`${base()}/comments?items=${encodeURIComponent(key)}`, { cache: "no-store" });
    if (!res.ok) return {};
    cache = { key, at: Date.now(), data: (await res.json()).comments ?? {} };
    return cache.data;
  } catch {
    return {};
  }
}

async function decorate(groups) {
  if (!base() || !groups.length) return;
  const approved = await approvedFor(groups.map((g) => g.id));
  for (const g of groups) {
    const slot = document.querySelector(`.c-foot-slot[data-foot="${CSS.escape(g.id)}"]`);
    if (!slot) continue;
    slot.replaceChildren();
    const list = approved[g.id] ?? [];
    if (list.length) {
      const d = el("details", undefined, "c-comments");
      d.appendChild(el("summary", `What people say (${list.length})`));
      const ul = el("ul");
      for (const c of list) {
        const li = el("li");
        li.appendChild(el("q", c.text));
        li.appendChild(el("span", `${c.name}, ${when(c.ts)}`, "c-who"));
        ul.appendChild(li);
      }
      d.appendChild(ul);
      slot.appendChild(d);
    }
    const b = el("button", "Leave a comment", "c-leave");
    b.type = "button";
    b.dataset.group = g.id;
    b.dataset.name = g.name;
    slot.appendChild(b);
  }
}

/* ---------- The comment form ---------- */
const dlg = document.createElement("dialog");
dlg.id = "commentDlg";
dlg.setAttribute("aria-labelledby", "cdTitle");
dlg.innerHTML = `
  <div id="cdForm">
    <h3 id="cdTitle">Leave a comment</h3>
    <p class="cd-about" id="cdAbout"></p>
    <form id="cdFormEl" novalidate>
      <label>Your name <input id="cdName" maxlength="60" autocomplete="name" required></label>
      <label>Email <span class="opt">(optional, so we can reply. It is never shown on the site.)</span><input id="cdEmail" type="email" maxlength="254" autocomplete="email"></label>
      <label>Your comment <textarea id="cdText" maxlength="500" rows="4" required></textarea></label>
      <p class="cd-count" id="cdCount" aria-live="polite">0 / 500</p>
      <div class="cd-hp" aria-hidden="true"><label>Leave empty <input id="cdWebsite" tabindex="-1" autocomplete="off"></label></div>
      <p class="cd-note">Comments are sent to the bakery and appear on the site only after they are approved.</p>
      <p class="cd-err" id="cdErr" role="alert"></p>
      <div class="cd-actions"><button type="submit" id="cdSend">Send comment</button><button type="button" id="cdCancel" class="ghost">Cancel</button></div>
    </form>
  </div>
  <div id="cdDone" hidden>
    <h3>Thank you!</h3>
    <p id="cdDoneText"></p>
    <div class="cd-actions"><button type="button" id="cdClose">Close</button></div>
  </div>`;
document.body.appendChild(dlg);

let target = { id: null, name: "" };

function openForm(id, name) {
  target = { id, name };
  $("cdAbout").textContent = id ? `About: ${name}` : "About: the bakery in general";
  $("cdErr").textContent = "";
  $("cdSend").disabled = false;
  $("cdForm").hidden = false;
  $("cdDone").hidden = true;
  $("cdText").value = "";
  $("cdCount").textContent = "0 / 500";
  dlg.showModal();
  $("cdName").focus();
}

$("cdText").addEventListener("input", () => { $("cdCount").textContent = `${$("cdText").value.length} / 500`; });
$("cdCancel").addEventListener("click", () => dlg.close());
$("cdClose").addEventListener("click", () => dlg.close());

$("cdFormEl").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("cdName").value.trim();
  const email = $("cdEmail").value.trim();
  const text = $("cdText").value.trim();
  const fail = (m) => { $("cdErr").textContent = m; $("cdSend").disabled = false; };
  if (!name) return fail("Please enter your name.");
  if (text.length < 3) return fail("Please write a comment.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("That email address doesn’t look right. You can leave it blank.");
  $("cdErr").textContent = "";
  $("cdSend").disabled = true;
  try {
    const res = await fetch(`${base()}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, text, itemGroupId: target.id, itemName: target.name, website: $("cdWebsite").value }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return fail(body.error || "Something went wrong. Please try again.");
    $("cdDoneText").textContent = "Your comment was sent to the bakery. It will appear on the site once it has been approved.";
    $("cdForm").hidden = true;
    $("cdDone").hidden = false;
  } catch {
    fail("We couldn’t reach the server. Please try again.");
  }
});

document.addEventListener("click", (e) => {
  const b = e.target.closest("button.c-leave");
  if (b) openForm(b.dataset.group, b.dataset.name);
  if (e.target.closest("#generalComment")) openForm(null, "");
});

/* ---------- Hook into the menu ---------- */
function addGeneralButton() {
  if (!base() || $("generalComment")) return;
  const tools = document.querySelector(".menu-tools");
  if (!tools) return;
  const b = el("button", "Send us a comment", "mini");
  b.type = "button";
  b.id = "generalComment";
  tools.appendChild(b);
}

HS.onRender((groups) => {
  addGeneralButton();
  decorate(groups);
});
