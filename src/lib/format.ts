const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export function dayKey(t: number): number {
  return startOfDay(t);
}

export function dayLabel(t: number, now = Date.now()): string {
  const diff = Math.round((startOfDay(now) - startOfDay(t)) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  const d = new Date(t);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

export function timeLabel(t: number): string {
  return new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function dateTime(t: number): string {
  return `${dayLabel(t)}, ${timeLabel(t)}`;
}

export function ago(t: number | null, now = Date.now()): string {
  if (!t) return 'never';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

export const num = (n: number) => n.toLocaleString('en-US');

export const stripe = (h: number) =>
  `repeating-linear-gradient(135deg, oklch(0.44 0.09 ${h}) 0 10px, oklch(0.40 0.09 ${h}) 10px 20px)`;

export const EMPTY_STRIPE = 'repeating-linear-gradient(135deg, #2B2930 0 10px, #26242B 10px 20px)';
