import { formatDistanceToNowStrict, format } from 'date-fns';

export const timeAgo = (iso: string) => `${formatDistanceToNowStrict(new Date(iso))} ago`;
export const shortDate = (iso: string) => format(new Date(iso), 'd MMM yyyy');
export const dateTime = (iso: string) => format(new Date(iso), 'd MMM yyyy, h:mm a');
export const coords = (lat: number, lng: number) => `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
export const hours = (h: number | null | undefined) =>
  h == null ? '—' : h < 1 ? '<1 h' : h < 48 ? `${Math.round(h)} h` : `${(h / 24).toFixed(1)} d`;
export const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`);
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
