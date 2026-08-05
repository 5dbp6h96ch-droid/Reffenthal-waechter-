export function formatGermanDateTime(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatGermanTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatGermanShortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
  }).format(date);
}

export function formatGermanDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

export function relativeGerman(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return 'gerade eben';
  if (diffMin === 1) return 'vor 1 Minute';
  if (diffMin < 60) return `vor ${diffMin} Minuten`;
  const diffH = Math.round(diffMin / 60);
  if (diffH === 1) return 'vor 1 Stunde';
  if (diffH < 24) return `vor ${diffH} Stunden`;
  const diffD = Math.round(diffH / 24);
  if (diffD === 1) return 'vor 1 Tag';
  return `vor ${diffD} Tagen`;
}

export function urlToLabel(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === '/' ? '' : u.pathname;
    return `${u.hostname}${path}${u.search}`;
  } catch {
    return url;
  }
}
