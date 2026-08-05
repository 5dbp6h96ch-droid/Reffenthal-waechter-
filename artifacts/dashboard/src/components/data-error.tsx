import { RefreshCcw, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DataErrorProps {
  title: string;
  onRetry: () => void;
}

export function DataError({ title, onRetry }: DataErrorProps) {
  return (
    <div
      className="rounded-xl border border-[hsl(var(--alarm))]/30 bg-[hsl(var(--alarm))]/[0.06] p-6 flex flex-col items-center justify-center text-center gap-3 h-full"
      data-testid="error-state"
    >
      <TriangleAlert className="h-6 w-6 text-[hsl(var(--alarm))]" />
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground mt-1">
          Die Verbindung zum Pegel-Wächter konnte nicht hergestellt werden.
        </p>
      </div>
      <Button size="sm" variant="outline" onClick={onRetry} data-testid="button-retry">
        <RefreshCcw className="h-3.5 w-3.5" />
        Erneut versuchen
      </Button>
    </div>
  );
}
