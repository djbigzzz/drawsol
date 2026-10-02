const LAMPORTS = BigInt(1_000_000_000);

/** lamports → "1.25" with between `min` and `max` decimals (trailing zeros trimmed down to min). */
export function sol(lamports: bigint, min = 2, max = 4): string {
  const neg = lamports < BigInt(0);
  const l = neg ? -lamports : lamports;
  const whole = l / LAMPORTS;
  const frac = (l % LAMPORTS).toString().padStart(9, "0").slice(0, max);
  let f = frac;
  while (f.length > min && f.endsWith("0")) f = f.slice(0, -1);
  return `${neg ? "-" : ""}${whole.toString()}${f.length ? "." + f : ""}`;
}

export const ticketNo = (n: number) => `#${n.toString().padStart(4, "0")}`;

export function ticketRange(first: number, count: number) {
  return count <= 1 ? ticketNo(first) : `${ticketNo(first)}–${ticketNo(first + count - 1)}`;
}

export function short(addr: string, head = 4, tail = 4) {
  return addr.length <= head + tail + 1 ? addr : `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const p2 = (n: number) => n.toString().padStart(2, "0");

/** "Sun 4 Oct, 04:13 UTC" */
export function utcLabel(unix: number) {
  const d = new Date(unix * 1000);
  return `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MO[d.getUTCMonth()]}, ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())} UTC`;
}

/** "Fri 18 Oct 22:00" in the viewer's time zone */
export function localLabel(unix: number) {
  const d = new Date(unix * 1000);
  return `${WD[d.getDay()]} ${d.getDate()} ${MO[d.getMonth()]} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

export function clock(unix: number) {
  const d = new Date(unix * 1000);
  return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}

export function shortDate(unix: number) {
  const d = new Date(unix * 1000);
  return `${d.getUTCDate()} ${MO[d.getUTCMonth()]}`;
}

export function splitDuration(secs: number) {
  const s = Math.max(0, Math.floor(secs));
  return {
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
  };
}

export function ago(unix: number, now: number) {
  const s = Math.max(0, now - unix);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function oneIn(numer: number, denom: number) {
  if (numer <= 0) return "—";
  const v = denom / numer;
  return `1 in ${v >= 100 ? Math.round(v).toLocaleString("en-US") : v.toFixed(v % 1 === 0 ? 0 : 1)}`;
}

export const pad2 = p2;
