import { Waves, RefreshCw } from 'lucide-react';
import { useWaechterState, useWaechterTreffer } from '@/hooks/use-waechter';
import { StatusCard } from '@/components/status-card';
import { MetaCard } from '@/components/meta-card';
import { PegelChart } from '@/components/pegel-chart';
import { TrefferList } from '@/components/treffer-list';
import { DataError } from '@/components/data-error';
import { relativeGerman } from '@/lib/format';

export default function Dashboard() {
  const {
    data: state,
    isLoading: isStateLoading,
    isError: isStateError,
    refetch: refetchState,
    dataUpdatedAt,
  } = useWaechterState();

  const {
    data: treffer,
    isLoading: isTrefferLoading,
    isError: isTrefferError,
    refetch: refetchTreffer,
  } = useWaechterTreffer();

  return (
    <div className="min-h-[100dvh] w-full bg-background">
      <div className="grain-overlay" />

      <header className="border-b border-border bg-sidebar text-sidebar-foreground">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-5 flex items-center justify-between rise-in">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <Waves className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-lg font-semibold leading-tight" data-testid="text-app-title">
                Reffenthal Wächter
              </h1>
              <p className="text-xs text-sidebar-foreground/60 leading-tight">
                Pegelstand-Überwachung · Speyer / Rhein
              </p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs text-sidebar-foreground/60 font-data">
            <RefreshCw className="h-3.5 w-3.5" />
            <span data-testid="text-last-refresh">
              {dataUpdatedAt ? `Aktualisiert ${relativeGerman(new Date(dataUpdatedAt).toISOString())}` : 'Lädt…'}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          <div className="lg:col-span-2">
            {isStateError ? (
              <DataError title="Aktueller Pegelstand nicht verfügbar" onRetry={() => refetchState()} />
            ) : (
              <StatusCard state={state} isLoading={isStateLoading} />
            )}
          </div>
          <MetaCard
            thresholdCm={state?.threshold_cm}
            lastDailyReportDate={state?.last_daily_report_date}
            trefferCount={treffer?.count}
            isLoadingState={isStateLoading}
            isLoadingTreffer={isTrefferLoading}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          <div className="lg:col-span-2">
            {isStateError ? (
              <DataError title="Pegelverlauf nicht verfügbar" onRetry={() => refetchState()} />
            ) : (
              <PegelChart
                history={state?.history}
                thresholdCm={state?.threshold_cm ?? 225}
                isLoading={isStateLoading}
              />
            )}
          </div>

          <div>
            {isTrefferError ? (
              <DataError title="Treffer-Liste nicht verfügbar" onRetry={() => refetchTreffer()} />
            ) : (
              <TrefferList urls={treffer?.urls} count={treffer?.count} isLoading={isTrefferLoading} />
            )}
          </div>
        </div>

        <footer className="pt-4 text-center text-xs text-muted-foreground font-data">
          Automatische Aktualisierung alle 2 Minuten · Schwellenwert {state?.threshold_cm ?? 225} cm
        </footer>
      </main>
    </div>
  );
}
