// Test-site behavior layered on the page: Refresh catalogue, and a spoofed cart + checkout that imitates
// GoDaddy's hosted checkout. Nothing here takes payment, and card details are never stored or sent.
import { addLocal, newId, postRemote } from "./submissions.js";

const HS = window.HS;
const $ = (id) => document.getElementById(id);
const { esc, money } = HS;

/* ---------- Refresh catalogue ---------- */
const when = (iso) =>
  iso ? new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }) + " ET" : "an unknown time";

function showStatus(extra = "") {
  const m = HS.meta();
  $("catalogStatus").textContent = `${m.source === "live" ? "Live from the store" : "Saved snapshot"}, ${when(m.generatedAt)}. ${extra}`.trim();
}

$("refreshCatalog").addEventListener("click", async () => {
  const btn = $("refreshCatalog");
  btn.disabled = true;
  $("catalogStatus").textContent = "Refreshing…";
  try {
    const d = await HS.reloadCatalog();
    const parts = [];
    if (d.added.length) parts.push(`new: ${d.added.join(", ")}`);
    if (d.changed.length) parts.push(`changed: ${d.changed.join("; ")}`);
    if (d.removed.length) parts.push(`removed: ${d.removed.join(", ")}`);
    const none = HS.meta().source === "live" ? "No changes." : "No changes in the saved snapshot (it only updates when the snapshot is re-run).";
    showStatus(parts.length ? `Updated. ${parts.join(" · ")}.` : none);
  } catch {
    $("catalogStatus").textContent = "Couldn’t refresh the catalogue. Please try again.";
  }
  btn.disabled = false;
});
HS.onChange(() => { if (!$("catalogStatus").textContent) showStatus(); });

/* ---------- Spoofed cart and checkout ---------- */
const TEST_CARDS = new Set(["4242424242424242", "4111111111111111", "5555555555554444", "378282246309005"]);
const BANNER = '<div class="fl-banner" role="alert">TEST PAGE &mdash; DO NOT SUBMIT REAL CREDIT CARD INFORMATION</div>';

const flow = document.createElement("div");
flow.id = "hsflow";
flow.hidden = true;
flow.tabIndex = -1;
flow.setAttribute("role", "dialog");
flow.setAttribute("aria-modal", "true");
flow.setAttribute("aria-label", "Test cart and checkout");
document.body.appendChild(flow);

let step = "cart";
let busy = false;
let captcha = "idle"; // idle | checking | ok
let order = null;
const cust = { name: "", email: "", phone: "", notes: "" };

const taxRate = () => {
  const r = Number(HS.settings().testTaxRate);
  return Number.isFinite(r) && r >= 0 ? r : 0.08;
};
const lines = () => HS.items().filter((i) => HS.qty(i.id) > 0);
const cents = (n) => money(n / 100);
const lineCents = (i) => Math.round(i.price * 100) * HS.qty(i.id);
function totals() {
  const sub = lines().reduce((t, i) => t + lineCents(i), 0);
  const tax = Math.round(sub * taxRate());
  return { sub, tax, total: sub + tax };
}

function pickupBlock() {
  const sel = HS.selection();
  return sel.text
    ? `<div class="fl-pick"><div><strong>Local pickup</strong><br>${esc(sel.text)} (Eastern)<br>Hearth and Soul Bakery, The Market at the Fareway, 8221 Germantown Ave., Philadelphia, PA 19118</div></div>`
    : '<p class="fl-err">No pickup time is chosen. Go back and pick one.</p>';
}

function summaryHtml(withTax) {
  const t = totals();
  return `<div class="fl-card"><h2>Order summary</h2>
    <ul class="fl-lines">${lines().map((i) => `<li><span class="nm">${HS.qty(i.id)} × ${esc(i.name)}</span><span>${cents(lineCents(i))}</span></li>`).join("")}</ul>
    <div class="fl-sum"><span>Subtotal</span><span>${cents(t.sub)}</span></div>
    <div class="fl-sum"><span>${withTax ? `Estimated tax (${(taxRate() * 100).toFixed(0)}%, test value)` : "Taxes"}</span><span>${withTax ? cents(t.tax) : "Calculated at checkout"}</span></div>
    ${withTax ? `<div class="fl-sum total"><span>Total</span><span>${cents(t.total)}</span></div>` : ""}</div>`;
}

function cartHtml() {
  const ls = lines();
  const sel = HS.selection();
  const ready = ls.length > 0 && sel.slotStart !== null && HS.stillBookable();
  return `<div class="fl-top"><span class="fl-store">Hearth and Soul Bakery</span><button class="fl-link" data-act="close">← Keep shopping</button></div>
    <h1>Your cart</h1>
    <div class="fl-grid"><div>
      <div class="fl-card">${ls.length ? `<ul class="fl-lines">${ls.map((i) => `<li>
        <span class="nm">${esc(i.name)}</span><span>${cents(lineCents(i))}</span>
        <span class="qty"><button data-act="dec" data-id="${esc(i.id)}" aria-label="Remove one ${esc(i.name)}">−</button><span aria-live="polite">${HS.qty(i.id)}</span><button data-act="inc" data-id="${esc(i.id)}" aria-label="Add one ${esc(i.name)}">+</button>
        <button class="fl-link" data-act="rm" data-id="${esc(i.id)}">Remove</button></span><span></span></li>`).join("")}</ul>` : "<p>Your cart is empty.</p>"}</div>
      ${pickupBlock()}
    </div><div>${ls.length ? summaryHtml(false) : ""}
      <button class="fl-btn" data-act="checkout" ${ready ? "" : "disabled"}>Checkout</button>
      <p class="fl-err" id="flErr">${ls.length && sel.slotStart !== null && !ready ? "That pickup time is no longer available. Go back and choose another." : ""}</p>
    </div></div>`;
}

function checkoutHtml() {
  return `<div class="fl-top"><span class="fl-store">Hearth and Soul Bakery</span><button class="fl-link" data-act="back">← Back to cart</button></div>
    <h1>Checkout</h1>
    <div class="fl-hint"><strong>Testing only.</strong> Use card <code>4242 4242 4242 4242</code>, any future date, any 3 digits, any ZIP. Real card numbers are rejected and never sent anywhere.</div>
    <div class="fl-grid"><form id="flForm" novalidate autocomplete="off"><div>
      <div class="fl-card"><h2>Contact</h2>
        <label>Email<input type="email" data-field="email" value="${esc(cust.email)}" autocomplete="email" maxlength="254"></label>
        <label>Full name<input type="text" data-field="name" value="${esc(cust.name)}" autocomplete="name" maxlength="100"></label>
        <label>Phone <span class="opt">(optional)</span><input type="tel" data-field="phone" value="${esc(cust.phone)}" autocomplete="tel" maxlength="30"></label>
      </div>
      <div class="fl-card"><h2>Delivery method</h2>${pickupBlock()}
        <label style="margin-top:.8rem">Allergies or order notes <span class="opt">(optional)</span><textarea data-field="notes" rows="3" maxlength="1000">${esc(cust.notes)}</textarea></label>
      </div>
      <div class="fl-card"><h2>Payment</h2>
        <label>Card number<input type="text" id="flCard" inputmode="numeric" autocomplete="off" maxlength="23" placeholder="4242 4242 4242 4242"></label>
        <div class="fl-row">
          <label>Expiry<input type="text" id="flExp" inputmode="numeric" autocomplete="off" maxlength="5" placeholder="MM/YY"></label>
          <label>CVC<input type="text" id="flCvc" inputmode="numeric" autocomplete="off" maxlength="4" placeholder="123"></label>
          <label>ZIP<input type="text" id="flZip" inputmode="numeric" autocomplete="off" maxlength="5" placeholder="19118"></label>
        </div>
        <div class="fl-captcha" id="flCaptcha"></div>
        <p class="fl-err" id="flErr" role="alert"></p>
        <button class="fl-btn" type="submit" id="flPay">Pay ${cents(totals().total)}</button>
      </div></div></form>
      <div>${summaryHtml(true)}</div></div>`;
}

function doneHtml() {
  const logLine = {
    shared: "Saved to the shared test submissions log.",
    failed: "We couldn’t reach the shared log, so this was saved in this browser’s log only.",
    local: "Saved to this browser’s test submissions log. No shared log is connected, so only this browser can see it.",
  }[order.log];
  return `<div class="fl-done"><div class="tick" aria-hidden="true">✓</div>
    <h1>Thank you${order.name ? ", " + esc(order.name) : ""}!</h1>
    <p>Your test order <strong>${esc(order.ref)}</strong> is confirmed.</p>
    <p>Pickup: ${esc(order.pickup)} (Eastern)</p>
    <p>${esc(logLine)} <a href="test_submissions/" target="_blank" rel="noopener">View test submissions</a></p>
    <p><strong>No payment was taken and nothing was created in GoDaddy.</strong></p></div>
    <div class="fl-grid"><div>${summaryHtml(true)}</div><div><button class="fl-btn" data-act="finish">Back to the site</button></div></div>`;
}

function paintCaptcha() {
  const el = $("flCaptcha");
  if (!el) return;
  const box = captcha === "ok" ? '<span class="box" aria-hidden="true">✓</span>' : captcha === "checking" ? '<span class="spin" aria-hidden="true"></span>' : '<button type="button" class="box" data-act="captcha" aria-label="I\'m not a robot"></button>';
  el.innerHTML = `${box}<span>I’m not a robot</span><small>Fake captcha<br>(test only)</small>`;
}

function render(keepScroll = false) {
  const top = flow.scrollTop;
  flow.innerHTML = BANNER + '<div class="fl-wrap">' + (step === "cart" ? cartHtml() : step === "checkout" ? checkoutHtml() : doneHtml()) + "</div>";
  if (step === "checkout") paintCaptcha();
  flow.scrollTop = keepScroll ? top : 0;
}

function openFlow() {
  step = "cart";
  captcha = "idle";
  render();
  flow.hidden = false;
  document.body.style.overflow = "hidden";
  flow.focus();
}
function closeFlow() {
  if (step === "done") HS.clearCart();
  flow.hidden = true;
  document.body.style.overflow = "";
  step = "cart";
}
HS.openCart = openFlow;

const fail = (msg) => {
  const el = $("flErr");
  if (el) el.textContent = msg;
};

async function pay() {
  if (busy) return;
  const sel = HS.selection();
  const email = cust.email.trim();
  const card = $("flCard").value.replace(/\D/g, "");
  const exp = /^(\d{2})\/(\d{2})$/.exec($("flExp").value.trim());
  if (!lines().length || !HS.stillBookable()) return fail("That pickup time is no longer available. Go back to the cart and choose another.");
  if (!cust.name.trim()) return fail("Enter your full name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Enter a valid email address.");
  if (cust.phone.trim() && !/^[0-9+().\-\s]{7,30}$/.test(cust.phone.trim())) return fail("Enter a valid phone number, or leave it blank.");
  if (!TEST_CARDS.has(card)) return fail("That isn’t a test card number. Do not enter a real card. Use 4242 4242 4242 4242.");
  const now = new Date();
  if (!exp || +exp[1] < 1 || +exp[1] > 12 || 2000 + +exp[2] < now.getFullYear() || (2000 + +exp[2] === now.getFullYear() && +exp[1] < now.getMonth() + 1)) return fail("Enter a future expiry date as MM/YY.");
  if (!/^\d{3,4}$/.test($("flCvc").value)) return fail("Enter the 3 or 4 digit security code.");
  if (!/^\d{5}$/.test($("flZip").value)) return fail("Enter a 5 digit ZIP code.");
  if (captcha !== "ok") return fail("Please confirm you’re not a robot.");

  busy = true;
  fail("");
  const payBtn = $("flPay");
  payBtn.disabled = true;
  payBtn.textContent = "Processing…";
  await new Promise((r) => setTimeout(r, 1200));

  const t = totals();
  const ref = "TEST-" + new Date().toISOString().slice(2, 10).replace(/-/g, "") + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
  const itemText = lines().map((i) => `  ${HS.qty(i.id)} x ${i.name}  ${cents(lineCents(i))}`).join("\n");
  const message = [
    `TEST ORDER ${ref}. NOT PAID: no payment was taken.`,
    `Pickup: ${sel.text} (Eastern)`,
    `Name: ${cust.name.trim()}`, `Email: ${email}`, `Phone: ${cust.phone.trim() || "(none)"}`,
    "", "Items:", itemText, "",
    `Subtotal: ${cents(t.sub)}`, `Estimated tax (test value): ${cents(t.tax)}`, `Total: ${cents(t.total)}`,
    "", `Allergies / notes: ${cust.notes.trim() || "(none)"}`,
  ].join("\n");

  // Card details are not part of the record. Only the order and contact details are logged.
  const record = {
    ref,
    name: cust.name.trim(),
    email,
    phone: cust.phone.trim(),
    pickup: sel.text,
    items: lines().map((i) => ({ name: i.name, qty: HS.qty(i.id), priceCents: Math.round(i.price * 100) })),
    subtotalCents: t.sub,
    taxCents: t.tax,
    totalCents: t.total,
    notes: cust.notes.trim(),
    message,
    testClock: Math.abs(HS.nowMs() - Date.now()) > 5000 ? new Date(HS.nowMs()).toISOString() : null,
  };
  // Always keep a copy in this browser's log; also send to the shared log when one is connected.
  addLocal({ ...record, id: newId(), ts: new Date().toISOString() });
  let log = "local";
  const base = (HS.settings().apiBase || "").trim().replace(/\/+$/, "");
  if (base) {
    try {
      await postRemote(base, record);
      log = "shared";
    } catch {
      log = "failed";
    }
  }
  order = { ref, name: record.name, pickup: sel.text, log };
  busy = false;
  step = "done";
  render();
}

flow.addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]");
  if (!b || busy) return;
  const id = b.dataset.id;
  switch (b.dataset.act) {
    case "close": case "finish": closeFlow(); break;
    case "inc": HS.setQty(id, HS.qty(id) + 1); render(true); break;
    case "dec": HS.setQty(id, HS.qty(id) - 1); render(true); break;
    case "rm": HS.setQty(id, 0); render(true); break;
    case "checkout": step = "checkout"; captcha = "idle"; render(); break;
    case "back": step = "cart"; render(); break;
    case "captcha":
      captcha = "checking"; paintCaptcha();
      setTimeout(() => { captcha = "ok"; paintCaptcha(); }, 900);
      break;
  }
});

flow.addEventListener("input", (e) => {
  const t = e.target;
  if (t.dataset?.field) cust[t.dataset.field] = t.value;
  if (t.id === "flCard") {
    const digits = t.value.replace(/\D/g, "");
    // Anything past the first few digits that isn't the start of a known test card is cleared immediately.
    if (digits.length >= 5 && ![...TEST_CARDS].some((c) => c.startsWith(digits))) {
      t.value = "";
      fail("That isn’t a test card number, so it was cleared. Do not enter a real card. Use 4242 4242 4242 4242.");
      return;
    }
    t.value = digits.replace(/(.{4})/g, "$1 ").trim();
  }
  if (t.id === "flExp") {
    const d = t.value.replace(/\D/g, "").slice(0, 4);
    t.value = d.length > 2 ? d.slice(0, 2) + "/" + d.slice(2) : d;
  }
});

flow.addEventListener("submit", (e) => {
  e.preventDefault();
  pay();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !flow.hidden && !busy) closeFlow();
});
