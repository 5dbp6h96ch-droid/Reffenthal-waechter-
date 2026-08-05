import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { relativeGerman, formatGermanDateTime } from '@/lib/format';
import { Activity, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { WaechterRunStatus } from '@workspace/api-client-react';

interface WaechterStatusCardProps {
  status: WaechterRunStatus | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

function getRunAge(lastRunAt: string | null): number | null {
  if (!lastRunAt) return null;
  const d = new Date(lastRunAt);
  if (Number.isNaN(d.getTime())) return null;
  return Date.now() - d.getTime();
}

export function WaechterStatusCard({ status, isLoading, isError, onRetry }: WaechterStatusCardProps) {
  const ageMs = status ? getRunAge(status.last_run_at) : null;
  const isStale = ageMs !== null && ageMs > STALE_THRESHOLD_MS;
  const hasError = !!status?.last_error;
  const neverRan = !isLoading && !isError && (!status?.last_run_at);

  const alertState = isError || neverRan || isStale || hasError;

  if (isError) {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Wächter-Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Status nicht abrufbar
            </div>
            <button
              onClick={onRetry}
              className="text-xs text-muted-foreground underline underline-offset-2 text-left"
            >
              Erneut versuchen
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={alertState ? 'border-destructive/50 bg-destructive/5' : ''}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Wächter-Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Last run time */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-xs text-muted-foreground mb-0.5">Letzter Lauf</div>
            {isLoading ? (
              <Skeleton className="h-5 w-36" />
            ) : neverRan ? (
              <span className="text-sm font-medium text-muted-foreground">Noch nicht gelaufen</span>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold font-data">
                  {relativeGerman(status!.last_run_at)}
                </span>
                {isStale ? (
                  <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                )}
              </div>
            )}
            {!isLoading && status?.last_run_at && (
              <div className="text-[11px] text-muted-foreground/70 font-data mt-0.5">
                {formatGermanDateTime(status.last_run_at)}
              </div>
            )}
          </div>

          {/* RSS hit count */}
          {!isLoading && status && (
            <div className="text-right shrink-0">
              <div className="text-xs text-muted-foreground mb-0.5">Neue Treffer</div>
              <span className="text-sm font-semibold font-data tabular-nums">
                {status.rss_new_count}
              </span>
            </div>
          )}
        </div>

        {/* Stale warning */}
        {isStale && !isLoading && (
          <div className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Kein Lauf seit über 2 Stunden – Wächter prüfen!
          </div>
        )}

        {/* Never ran warning */}
        {neverRan && (
          <div className="flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Wächter wurde noch nicht ausgeführt.
          </div>
        )}

        {/* Last error */}
        {hasError && !isLoading && (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Fehler</Badge>
            </div>
            <p className="text-[11px] font-data text-destructive/80 break-all leading-relaxed">
              {status!.last_error}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
