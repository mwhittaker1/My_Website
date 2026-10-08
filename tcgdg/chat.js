const API = (window.TCGDG_API || '').replace(/\/$/, '');
const $ = (s) => document.querySelector(s);
const KEY = 'deck-chat-v1';
let saved = {};
try { saved = JSON.parse(sessionStorage.getItem(KEY) || '{}'); } catch {}
let state = saved.state || null;
let history = saved.history || [];

function add(cls, who, text) {
  const d = document.createElement('div');
  d.className = `msg ${cls}`;
  if (who) { const n = document.createElement('span'); n.className = 'name'; n.textContent = who; d.append(n); }
  d.append(document.createTextNode(text));
  $('#messages').append(d);
  $('#messages').scrollTop = 1e9;
  return d;
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = (n) => '$' + Number(n || 0).toFixed(2);
const ORDER = ['Creature', 'Planeswalker', 'Artifact', 'Instant', 'Sorcery', 'Enchantment', 'Battle', 'Other', 'Land'];
const TYPE_ICON = { Creature: '⚔️', Planeswalker: '👑', Artifact: '🛡️', Instant: '⚡', Sorcery: '📜', Enchantment: '✨', Battle: '🏰', Other: '•', Land: '🌲' };
const RARITY_COLOR = { mythic: '#f97316', rare: '#eab308', uncommon: '#94a3b8', common: '#111827' };
const MANA = ['W', 'U', 'B', 'R', 'G', 'C'];
let view = null, sortMode = 'type', hover = null, hand = null;
const pidUrl = (c) => (c.pid ? `https://www.tcgplayer.com/product/${c.pid}` : `https://www.tcgplayer.com/search/magic/product?q=${encodeURIComponent(c.name)}`);
const cap = (s) => String(s || '').replace(/^./, (x) => x.toUpperCase());

function sortCards(list) {
  const l = [...list];
  if (sortMode === 'name') l.sort((a, b) => a.name.localeCompare(b.name));
  else if (sortMode === 'price') l.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
  else l.sort((a, b) => (a.cmc ?? 0) - (b.cmc ?? 0) || a.name.localeCompare(b.name));
  return l;
}
function rowHtml(c, i) {
  return `<div class="row" tabindex="0" data-i="${i}"><span class="qty">${c.qty}</span><span class="name">${esc(c.name)}${c.owned ? `<em class="own">own ${c.owned}/${c.qty}</em>` : ''}</span><span class="mc">${esc(c.manaCost || '')}</span><span class="pr">${c.owned >= c.qty ? `<s>${money(c.price)}</s>` : money(c.price)}</span></div>`;
}
function setPreview(c) {
  if (!c) return;
  hover = c;
  $('#p-img').innerHTML = c.image ? `<img src="${esc(c.image)}" alt="${esc(c.name)}" />` : `<div class="noimg">${esc(c.name)}</div>`;
  $('#p-src').textContent = c.priceSource === 'assumed' ? 'Estimated price' : 'TCGplayer Standard';
  $('#p-rar').textContent = cap(c.rarity);
  $('#p-name').textContent = c.name;
  $('#p-price').textContent = money(c.price);
  $('#p-buy').href = pidUrl(c);
  document.querySelectorAll('.row.active').forEach((r) => r.classList.remove('active'));
}
function renderOverview(rec, cards) {
  const nonland = cards.filter((c) => c.type !== 'Land');
  const total = cards.reduce((s, c) => s + c.qty, 0);
  const curve = [0, 0, 0, 0, 0, 0];
  nonland.forEach((c) => (curve[Math.min(5, Math.round(c.cmc || 0))] += c.qty));
  const max = Math.max(1, ...curve);
  $('#o-curve').innerHTML = curve.map((n) => `<div class="col"><div class="bar${n ? '' : ' zero'}" style="height:${(n / max) * 100}%"></div></div>`).join('');
  $('#o-curve-n').innerHTML = curve.map((n) => `<span>${n}</span>`).join('');
  $('#o-curve-l').innerHTML = ['0', '1', '2', '3', '4', '5+'].map((l) => `<span>${l}</span>`).join('');
  const tc = {}; cards.forEach((c) => (tc[c.type] = (tc[c.type] || 0) + c.qty));
  $('#o-types').innerHTML = ORDER.filter((t) => tc[t]).map((t) => `<div class="tcell"><div class="ic">${TYPE_ICON[t]}</div><b>${tc[t]}</b><span>${t}</span></div>`).join('');
  const cc = Object.fromEntries(MANA.map((m) => [m, 0]));
  nonland.forEach((c) => (c.colors || []).forEach((m) => { if (m in cc) cc[m] += c.qty; }));
  $('#o-colors').innerHTML = MANA.filter((m) => cc[m]).map((m) => `<div class="ccell"><span class="mana m-${m}">${m}</span>${cc[m]} cards</div>`).join('') || '<small>Colorless</small>';
  const rc = { mythic: 0, rare: 0, uncommon: 0, common: 0 };
  cards.forEach((c) => { if (c.rarity in rc) rc[c.rarity] += c.qty; });
  $('#o-rarity').innerHTML = Object.entries(rc).map(([r, n]) => `<div class="rcell"><i style="background:${RARITY_COLOR[r]}"></i><span>${cap(r)}</span><b>${n}</b></div>`).join('');
  $('#o-count').textContent = `${total === 60 ? '✓ ' : ''}${total} Cards`;
  $('#o-count').classList.toggle('bad', total !== 60);
  renderHand(cards);
  const hasCol = Object.keys(state.collection || {}).length > 0;
  const full = rec.estimated_cost;
  $('#totals').innerHTML = `<div class="line"><span>Maindeck Market Price:</span><span>${money(full)}</span></div><div class="line"><span>Sideboard Market Price:</span><span>$0.00</span></div>
    <div class="grand"><b>Total Market Price:</b><strong>${money(full)}</strong></div>
    <div class="need">${hasCol ? `${rec.cards_to_purchase} cards to purchase (${money(rec.acquisition_cost_after_collection)}) after your collection` : `${total} cards to purchase`}</div>
    <a class="btn-green" target="_blank" rel="noopener" href="${buyUrl(cards)}">Buy Deck on TCGplayer</a>`;
}
function drawHand(cards) {
  const pool = cards.flatMap((c) => Array(c.qty).fill(c));
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const m = new Map();
  pool.slice(0, 7).forEach((c) => m.set(c.name, { qty: (m.get(c.name)?.qty || 0) + 1, name: c.name, sub: c.typeLine }));
  return [...m.values()];
}
function renderHand(cards, redraw) {
  if (!hand || redraw) hand = drawHand(cards);
  $('#o-hand').innerHTML = hand.map((h) => `<div><b>${h.qty} ${esc(h.name)}</b><span>${esc(h.sub || '')}</span></div>`).join('');
}
const buyUrl = (cards) => 'https://www.tcgplayer.com/massentry?productline=Magic&c=' + encodeURIComponent(cards.map((c) => ({ ...c, need: c.qty - (c.owned || 0) })).filter((c) => c.need > 0).map((c) => `${c.need} ${c.name}`).join('||'));
let shown = [];
function renderDeck() {
  const set = state?.active_recommendation_set;
  const profiles = set ? Object.keys(set.recommendations) : [];
  const chosen = state?.selected_recommendation_profile || set?.selected_profile;
  if (!view || !profiles.includes(view)) view = chosen;
  const rec = set?.recommendations?.[view] || null;
  if (!rec) { $('#ws').hidden = true; $('#empty').hidden = false; return; }
  const cards = rec.decklist;
  const hasCol = Object.keys(state.collection || {}).length > 0;
  const count = cards.reduce((s, c) => s + c.qty, 0);
  $('#d-adv').textContent = `Game Guru ${view.toUpperCase()} · ${rec.archetype || ''}`;
  $('#d-name').textContent = rec.deck_name;
  $('#d-price').innerHTML = hasCol ? `<small>STILL TO BUY (${rec.cards_to_purchase} cards)</small><strong>${money(rec.acquisition_cost_after_collection)}</strong><small>Full deck ${money(rec.estimated_cost)}</small>` : `<small>MARKET PRICE:</small><strong>${money(rec.estimated_cost)}</strong>`;
  $('#d-buy').href = buyUrl(cards);
  $('#d-count').textContent = `Maindeck, ${count} cards`;
  $('#tabs').innerHTML = profiles.map((p) => `<button class="take${p === view ? ' on' : ''}" data-p="${p}" type="button">${p}${p === chosen ? ' <span class="rec">RECOMMENDED</span>' : ''}</button>`).join('');
  shown = [];
  let html = '';
  if (sortMode === 'type') {
    const groups = {};
    for (const c of cards) (groups[c.type] ??= []).push(c);
    for (const g of Object.keys(groups).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))) {
      html += `<div class="section"><h3>${esc(g.toUpperCase())} (${groups[g].reduce((s, c) => s + c.qty, 0)})</h3>${sortCards(groups[g]).map((c) => { shown.push(c); return rowHtml(c, shown.length - 1); }).join('')}</div>`;
    }
  } else {
    html = `<div class="section"><h3>ALL CARDS (${count})</h3>${sortCards(cards).map((c) => { shown.push(c); return rowHtml(c, shown.length - 1); }).join('')}</div>`;
  }
  $('#sections').innerHTML = html;
  const ev = rec.evidence || {};
  $('#analysis').innerHTML = `<p><b>Scores:</b> competitive ${rec.competitive_score}, originality ${rec.originality_score}, budget ${rec.budget_score}${rec.collection_fit_score != null ? `, collection fit ${rec.collection_fit_score}%` : ''}. Confidence ${rec.confidence}.</p>
    ${(rec.key_card_choices || []).length ? `<p><b>Key cards:</b> ${rec.key_card_choices.map(esc).join('; ')}.</p>` : ''}
    ${(rec.major_tradeoffs || []).map((t) => `<p>${esc(t)}</p>`).join('')}
    <p class="muted">Based on ${ev.observations ?? '?'} recent results (${ev.top_results ?? 0} top finishes); ${esc(ev.scores_source || '')}.</p>`;
  $('#ws').hidden = false;
  $('#empty').hidden = true;
  renderOverview(rec, cards);
  setPreview(shown.find((c) => c.name === hover?.name) || shown[0]);
}
$('#ws').addEventListener('click', (e) => {
  const b = e.target.closest('.take');
  if (b) { view = b.dataset.p; hand = null; renderDeck(); }
  if (e.target.closest('#btn-draw')) { const rec = state.active_recommendation_set.recommendations[view]; renderHand(rec.decklist, true); }
});
$('#sort').addEventListener('change', (e) => { sortMode = e.target.value; renderDeck(); });
const rowPreview = (e) => { const r = e.target.closest('.row'); if (r) { setPreview(shown[+r.dataset.i]); r.classList.add('active'); } };
$('#sections').addEventListener('mouseover', rowPreview);
$('#sections').addEventListener('focusin', rowPreview);
const TAGS = { Beeper: 'Maximum competitive strength', Sapphire: 'Value, proven consistency & minimal spend', Levi: 'Maximum performance per dollar', Clyde: 'Functional originality & fun' };
function setIcons(p) { document.querySelectorAll('.beeper-btn img, .chat-head img').forEach((im) => { im.alt = p; im.onerror = () => { im.onerror = null; im.src = 'assets/beeper.png'; }; im.src = 'assets/' + p.toLowerCase() + '.png'; }); }
function setHeader() { const p = state?.selected_personality || 'Beeper'; setIcons(p); $('#who').textContent = p; $('#tagline').textContent = TAGS[p] || ''; }
const persist = () => sessionStorage.setItem(KEY, JSON.stringify({ state, history: history.slice(-12) }));

for (const m of history) add(m.role === 'user' ? 'user' : 'bot', m.role === 'user' ? 'You' : (m.who || 'Beeper'), m.content);

fetch(API + '/api/status').then((r) => r.json()).then(async (s) => {
  $('#mode').textContent = s.llm ? `AI: ${s.model}` : 'Offline mode';
  if (!state) state = { ...s.initialState, selected_personality: 'Beeper' };
}).catch(() => {});

$('#form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = $('#input').value.trim();
  if (!text) return;
  $('#input').value = '';
  add('user', 'You', text);
  history.push({ role: 'user', content: text });
  const typing = add('bot', state?.selected_personality || 'Beeper', '…');
  $('#send').disabled = true;
  try {
    const res = await fetch(API + '/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, state, history: history.slice(-12) }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    if (data.state) state = data.state;
    if (data.recommendationsChanged) { view = null; hand = null; }
    typing.remove();
    if (data.reply) {
      const who = data.state?.selected_personality || 'Beeper';
      const clean = data.reply.replace(/\*\*/g, '').replace(/[^.\n]*Gurus' Takes[^.\n]*\.?/gi, '').trim();
      if (data.handoff) add('sys', '', `${data.handoff.from} hands you off to ${data.handoff.to}`);
      add('bot', who, clean);
      history.push({ role: 'assistant', content: clean, who });
    }
    renderDeck();
    setHeader();
    persist();
  } catch (err) {
    typing.remove();
    add('err', '', `Something went wrong: ${err.message}`);
  } finally { $('#send').disabled = false; $('#input').focus(); }
});

renderDeck();
setHeader();

document.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => { $('#input').value = b.textContent; $('#form').requestSubmit(); }));
$('#newchat').addEventListener('click', () => { sessionStorage.removeItem(KEY); location.reload(); });
if (history.length) $('#chips').hidden = true;
$('#form').addEventListener('submit', () => { $('#chips').hidden = true; });