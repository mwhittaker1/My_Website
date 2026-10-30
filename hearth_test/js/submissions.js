// Test-submissions log, shared by the checkout (writes) and /test_submissions (reads).
// Two places a submission can live:
//   - this browser (localStorage): always works, but only this browser can see it
//   - the shared log (the Worker at settings.apiBase): visible to anyone with the admin password
const KEY = "hs-submissions";
const MAX_LOCAL = 200;

export function readLocal() {
  try {
    const a = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}
function writeLocal(a) {
  try { localStorage.setItem(KEY, JSON.stringify(a.slice(0, MAX_LOCAL))); return true; } catch { return false; }
}
export function addLocal(rec) {
  return writeLocal([rec, ...readLocal()]);
}
export function removeLocal(id) {
  writeLocal(readLocal().filter((r) => r.id !== id));
}
export function clearLocal() {
  try { localStorage.removeItem(KEY); } catch {}
}

export function newId() {
  return crypto.randomUUID();
}

export async function postRemote(base, rec) {
  const res = await fetch(base + "/submissions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rec) });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

async function authed(url, token) {
  const res = await fetch(url, { headers: { Authorization: "Bearer " + token }, cache: "no-store" });
  if (res.status === 401) throw Object.assign(new Error("Wrong password."), { code: 401 });
  if (res.status === 503) throw Object.assign(new Error("The shared log has no password configured yet."), { code: 503 });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}
export const listRemote = (base, token) => authed(base + "/submissions", token);
export const getRemote = (base, token, id) => authed(base + "/submissions/" + encodeURIComponent(id), token);
