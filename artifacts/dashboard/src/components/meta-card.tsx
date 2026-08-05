import { Gauge, CalendarClock, ListChecks } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { formatGermanDate } from '@/lib/format';

interface MetaCardProps {
  thresholdCm: number | undefined;
  lastDailyReportDate: string | null | undefined;
  trefferCount: number | undefined;
  isLoadingState: boolean;
  isLoadingTreffer: boolean;
}

export function MetaCard({
  thresholdCm,
  lastDailyReportDate,
  trefferCount,
  isLoadingState,
  isLoadingTreffer,
}: MetaCardProps) {
  return (
    <div className="rounded-xl border border-card-border bg-card p-5 grid grid-cols-1 gap-4" data-testid="card-meta">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          <Gauge className="h-3.5 w-3.5" />
          Schwellenwert
        </div>
        {isLoadingState ? (
          <Skeleton className="h-5 w-14" />
        ) : (
          <span className="font-data text-sm font-semibold" data-testid="text-threshold">
            {thresholdCm ?? 225} cm
          </span>
        )}
      </div>

      <div className="h-px bg-border" />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          <CalendarClock className="h-3.5 w-3.5" />
          Letzter Tagesbericht
        </div>
        {isLoadingState ? (
          <Skeleton className="h-5 w-20" />
        ) : (
          <span className="font-data text-sm font-semibold" data-testid="text-daily-report-date">
            {formatGermanDate(lastDailyReportDate ?? null)}
          </span>
        )}
      </div>

      <div className="h-px bg-border" />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          <ListChecks className="h-3.5 w-3.5" />
          Treffer gesamt
        </div>
        {isLoadingTreffer ? (
          <Skeleton className="h-5 w-10" />
        ) : (
          <span className="font-data text-sm font-semibold" data-testid="text-treffer-count-meta">
            {trefferCount ?? 0}
          </span>
        )}
      </div>
    </div>
  );
}
