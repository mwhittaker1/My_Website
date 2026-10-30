// Pickup-slot rules. Ported from the prototype's script so the server owns them.
// Earliest pickup = later of (now + leadHours) and the next open window; latest = now + maxDays.
// All wall-clock math is in the store timezone, with DST handled by etToUtc.

export const DEFAULT_SETTINGS = {
  timezone: "America/New_York",
  leadHours: 24,
  maxDays: 14,
  slotMinutes: 60,
  // Weekday (0 = Sunday) -> [open, close] in minutes after midnight, or null when closed.
  hours: {
    0: [600, 840],
    1: null,
    2: null,
    3: null,
    4: [540, 1020],
    5: [540, 1020],
    6: [540, 1020],
  },
  // "YYYY-MM-DD" dates (store local) that cannot be picked up.
  blackoutDates: [],
};

const formatters = new Map();

function partsFormatter(tz) {
  if (!formatters.has(tz)) {
    formatters.set(
      tz,
      new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hourCycle: "h23",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
      }),
    );
  }
  return formatters.get(tz);
}

export function localParts(ms, tz) {
  const out = {};
  for (const p of partsFormatter(tz).formatToParts(new Date(ms))) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return out;
}

function offsetMs(ms, tz) {
  const p = localParts(ms, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

// Local wall-clock time in tz -> UTC ms. Re-checks the offset so times near a clock change resolve correctly.
export function localToUtc(y, m, d, h, mi, tz) {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const o = offsetMs(guess, tz);
  let t = guess - o;
  const o2 = offsetMs(t, tz);
  if (o2 !== o) t = guess - o2;
  return t;
}

const pad = (n) => String(n).padStart(2, "0");

export function validateSettings(s) {
  const errors = [];
  if (!(s.leadHours >= 0)) errors.push("leadHours must be 0 or more");
  if (!(s.maxDays >= 1)) errors.push("maxDays must be at least 1");
  if (!(s.slotMinutes >= 15)) errors.push("slotMinutes must be at least 15");
  for (let d = 0; d <= 6; d++) {
    const h = s.hours?.[d];
    if (h == null) continue;
    if (!Array.isArray(h) || h.length !== 2 || !(h[0] >= 0 && h[1] <= 1440 && h[0] < h[1])) {
      errors.push(`hours for weekday ${d} must be [open, close] minutes with open < close`);
    }
  }
  for (const b of s.blackoutDates ?? []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b)) errors.push(`blackout date "${b}" must be YYYY-MM-DD`);
  }
  return errors;
}

// Returns {now, earliest, latest, days: [{date, weekday, ok, reason, slots: [{start, end, ok}]}], first}.
// reason is "" for a bookable day, otherwise "Closed" | "Unavailable" | "Too soon" | "Too far".
export function buildSlots(now, settings = DEFAULT_SETTINGS) {
  const { timezone: tz, leadHours, maxDays, slotMinutes, hours } = settings;
  const blackout = new Set(settings.blackoutDates ?? []);
  const earliest = now + leadHours * 3600000;
  const latest = now + maxDays * 86400000;
  const p = localParts(now, tz);
  const days = [];
  let first = null;

  for (let i = 0; i <= maxDays; i++) {
    const d = new Date(Date.UTC(p.year, p.month - 1, p.day + i));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const dd = d.getUTCDate();
    const weekday = d.getUTCDay();
    const date = `${y}-${pad(m)}-${pad(dd)}`;
    const h = hours[weekday];
    const slots = [];
    if (h) {
      for (let min = h[0]; min + slotMinutes <= h[1]; min += slotMinutes) {
        const start = localToUtc(y, m, dd, Math.floor(min / 60), min % 60, tz);
        slots.push({ start, end: start + slotMinutes * 60000, ok: start >= earliest && start <= latest });
      }
    }
    const isBlackout = blackout.has(date);
    if (isBlackout) for (const s of slots) s.ok = false;
    const ok = slots.some((s) => s.ok);
    let reason = "";
    if (!slots.length) reason = "Closed";
    else if (isBlackout) reason = "Unavailable";
    else if (!ok) reason = slots[slots.length - 1].start < earliest ? "Too soon" : "Too far";
    days.push({ date, weekday, ok, reason, slots });
    if (!first && ok) first = { date, slot: slots.find((s) => s.ok) };
  }
  return { now, earliest, latest, days, first };
}

// Server-side check used at order time: is this exact slot start still bookable?
export function isBookable(startMs, now, settings = DEFAULT_SETTINGS) {
  const { days } = buildSlots(now, settings);
  return days.some((day) => day.slots.some((s) => s.ok && s.start === startMs));
}
