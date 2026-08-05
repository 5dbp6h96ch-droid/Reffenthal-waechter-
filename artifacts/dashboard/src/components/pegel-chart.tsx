import { useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { formatGermanShortDate, formatGermanTime } from '@/lib/format';
import type { PegelEntry } from '@workspace/api-client-react';

interface PegelChartProps {
  history: PegelEntry[] | undefined;
  thresholdCm: number;
  isLoading: boolean;
}

function CustomTooltip({ active, payload, thresholdCm }: any) {
  if (!active || !payload || !payload.length) return null;
  const point = payload[0].payload;
  const above = point.cm >= thresholdCm;
  return (
    <div className="rounded-lg border border-card-border bg-popover px-3 py-2 shadow-md text-xs">
      <div className="font-data text-muted-foreground mb-1">
        {formatGermanShortDate(point.ts)} · {formatGermanTime(point.ts)} Uhr
      </div>
      <div className="flex items-center gap-1.5 font-data font-semibold">
        <span
          className={`h-1.5 w-1.5 rounded-full ${above ? 'bg-[hsl(var(--safe))]' : 'bg-[hsl(var(--alarm))]'}`}
        />
        {point.cm} cm
      </div>
    </div>
  );
}

export function PegelChart({ history, thresholdCm, isLoading }: PegelChartProps) {
  const data = useMemo(() => {
    if (!history) return [];
    return [...history]
      .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())
      .map((entry) => ({ ...entry, tsLabel: formatGermanShortDate(entry.ts) }));
  }, [history]);

  const latestAbove = useMemo(() => {
    if (data.length === 0) return true;
    return data[data.length - 1].cm >= thresholdCm;
  }, [data, thresholdCm]);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-card-border bg-card p-6" data-testid="chart-loading">
        <Skeleton className="h-5 w-40 mb-6" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div
        className="rounded-xl border border-card-border bg-card p-6 flex flex-col items-center justify-center h-80 text-center"
        data-testid="chart-empty"
      >
        <p className="text-sm text-muted-foreground">Noch keine Verlaufsdaten vorhanden.</p>
        <p className="text-xs text-muted-foreground mt-1">Sobald Messwerte eintreffen, erscheint hier der Pegelverlauf.</p>
      </div>
    );
  }

  const lineColor = latestAbove ? 'hsl(var(--safe))' : 'hsl(var(--alarm))';

  return (
    <div className="rounded-xl border border-card-border bg-card p-6" data-testid="chart-pegel-history">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Pegelverlauf
        </h3>
        <div className="flex items-center gap-4 text-[11px] font-data text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-3 rounded-full bg-[hsl(var(--safe))]" /> über {thresholdCm} cm
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-3 rounded-full bg-[hsl(var(--alarm))]" /> unter {thresholdCm} cm
          </span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={288}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id="pegelFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity={0.25} />
              <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 5" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="ts"
            tickFormatter={(ts: string) => formatGermanShortDate(ts)}
            tick={{ fontSize: 11, fontFamily: 'var(--app-font-mono)', fill: 'hsl(var(--muted-foreground))' }}
            axisLine={{ stroke: 'hsl(var(--border))' }}
            tickLine={false}
            minTickGap={32}
          />
          <YAxis
            domain={['dataMin - 15', 'dataMax + 15']}
            tick={{ fontSize: 11, fontFamily: 'var(--app-font-mono)', fill: 'hsl(var(--muted-foreground))' }}
            axisLine={false}
            tickLine={false}
            width={44}
            unit=" cm"
          />
          <Tooltip content={<CustomTooltip thresholdCm={thresholdCm} />} />
          <ReferenceLine
            y={thresholdCm}
            stroke="hsl(var(--accent))"
            strokeDasharray="4 4"
            strokeWidth={1.5}
            label={{
              value: `Schwelle ${thresholdCm} cm`,
              position: 'insideTopRight',
              fill: 'hsl(var(--accent))',
              fontSize: 11,
              fontFamily: 'var(--app-font-mono)',
            }}
          />
          <Area type="monotone" dataKey="cm" stroke="none" fill="url(#pegelFill)" isAnimationActive={false} />
          <Line
            type="monotone"
            dataKey="cm"
            stroke={lineColor}
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
