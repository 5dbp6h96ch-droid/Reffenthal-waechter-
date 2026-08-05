import { Waves, TriangleAlert, CircleCheck } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { formatGermanDateTime, relativeGerman } from '@/lib/format';
import type { WaechterState } from '@workspace/api-client-react';

interface StatusCardProps {
  state: WaechterState | undefined;
  isLoading: boolean;
}

export function StatusCard({ state, isLoading }: StatusCardProps) {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-card-border bg-card p-6" data-testid="card-status-loading">
        <Skeleton className="h-4 w-32 mb-4" />
        <Skeleton className="h-16 w-40 mb-3" />
        <Skeleton className="h-4 w-48" />
      </div>
    );
  }

  const cm = state?.last_pegel_cm ?? null;
  const threshold = state?.threshold_cm ?? 225;
  const isAlarm = cm !== null && cm < threshold;
  const isKnown = cm !== null;

  return (
    <div
      className={`relative overflow-hidden rounded-xl border p-6 transition-colors ${
        isKnown
          ? isAlarm
            ? 'border-[hsl(var(--alarm))]/30 bg-[hsl(var(--alarm))]/[0.06]'
            : 'border-[hsl(var(--safe))]/30 bg-[hsl(var(--safe))]/[0.06]'
          : 'border-card-border bg-card'
      }`}
      data-testid="card-status"
    >
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          <Waves className="h-3.5 w-3.5" />
          Pegel Reffenthal / Speyer
        </div>
        {isKnown && (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
              isAlarm
                ? 'border-[hsl(var(--alarm))]/40 bg-[hsl(var(--alarm))] text-[hsl(var(--alarm-foreground))]'
                : 'border-[hsl(var(--safe))]/40 bg-[hsl(var(--safe))] text-[hsl(var(--safe-foreground))]'
            }`}
            data-testid="badge-status"
          >
            <span className={`h-1.5 w-1.5 rounded-full bg-current ${!isAlarm ? 'pulse-dot' : ''}`} />
            {isAlarm ? 'Alarm' : 'Grün'}
          </span>
        )}
      </div>

      <div className="flex items-end gap-3 mb-1">
        <span
          className="font-data text-6xl md:text-7xl font-semibold leading-none tabular-nums"
          data-testid="text-current-cm"
        >
          {isKnown ? cm : '—'}
        </span>
        <span className="text-lg font-medium text-muted-foreground mb-1.5">cm</span>
      </div>

      <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-3">
        {isKnown ? (
          isAlarm ? (
            <TriangleAlert className="h-4 w-4 text-[hsl(var(--alarm))]" />
          ) : (
            <CircleCheck className="h-4 w-4 text-[hsl(var(--safe))]" />
          )
        ) : null}
        <span>
          {isKnown
            ? isAlarm
              ? `${threshold - (cm ?? 0)} cm unter Schwellenwert (${threshold} cm)`
              : `${(cm ?? 0) - threshold} cm über Schwellenwert (${threshold} cm)`
            : 'Noch keine Messung empfangen'}
        </span>
      </div>

      <div className="mt-5 pt-4 border-t border-current/10 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Letzte Messung</span>
        <div className="text-right">
          <div className="font-data font-medium" data-testid="text-last-measurement-time">
            {formatGermanDateTime(state?.last_pegel_time ?? null)} Uhr
          </div>
          <div className="text-muted-foreground">{relativeGerman(state?.last_pegel_time ?? null)}</div>
        </div>
      </div>
    </div>
  );
}
