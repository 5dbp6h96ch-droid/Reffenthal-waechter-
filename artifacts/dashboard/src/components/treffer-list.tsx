import { ExternalLink, Link2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { urlToLabel } from '@/lib/format';

interface TrefferListProps {
  urls: string[] | undefined;
  count: number | undefined;
  isLoading: boolean;
}

export function TrefferList({ urls, count, isLoading }: TrefferListProps) {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-card-border bg-card p-6" data-testid="treffer-loading">
        <Skeleton className="h-5 w-32 mb-4" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const list = urls ?? [];

  return (
    <div className="rounded-xl border border-card-border bg-card p-6 flex flex-col h-full" data-testid="card-treffer">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground flex items-center gap-2">
          <Link2 className="h-3.5 w-3.5" />
          Treffer (gemeldete Alarme)
        </h3>
        <span
          className="font-data text-xs font-semibold rounded-full bg-secondary text-secondary-foreground px-2.5 py-1"
          data-testid="text-treffer-count"
        >
          {count ?? list.length}
        </span>
      </div>

      {list.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-8" data-testid="treffer-empty">
          <p className="text-sm text-muted-foreground">Noch keine Treffer erfasst.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Sobald eine URL einen Alarm auslöst, erscheint sie hier.
          </p>
        </div>
      ) : (
        <div className="pegel-scroll overflow-y-auto max-h-80 -mx-2 pr-1">
          <ul className="space-y-1">
            {list.map((url, i) => (
              <li key={`${url}-${i}`}>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center justify-between gap-2 rounded-md px-2 py-2 hover-elevate active-elevate-2 border border-transparent"
                  data-testid={`link-treffer-${i}`}
                >
                  <span className="font-data text-sm truncate text-foreground">
                    {urlToLabel(url)}
                  </span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-foreground" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
