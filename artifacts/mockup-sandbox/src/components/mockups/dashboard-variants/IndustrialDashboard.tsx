import React, { useMemo } from 'react';
import { Waves, Activity, AlertTriangle, Clock, RefreshCcw, ExternalLink, HardDrive } from 'lucide-react';
import './industrial-dashboard.css';

// --- MOCK DATA ---
const THRESHOLD = 225;
const CURRENT_LEVEL = 214; // Alert state! (below threshold)
const LAST_UPDATE = new Date(Date.now() - 1000 * 60 * 2).toISOString();

const HISTORY = Array.from({ length: 48 }).map((_, i) => {
  const time = new Date(Date.now() - (47 - i) * 1000 * 60 * 60);
  // Generate some realistic looking river level data drifting downwards
  const baseLevel = 240 - (i * 0.6); 
  const noise = Math.sin(i * 0.5) * 5 + Math.random() * 2;
  return {
    timestamp: time.toISOString(),
    level: Math.round(baseLevel + noise),
  };
});

const TREFFER = [
  { id: 1, title: 'Wiesbaden Kurier: Rheinpegel fällt weiter', url: '#', time: 'Vor 2 Stunden' },
  { id: 2, title: 'SWR: Einschränkungen im Schiffsverkehr', url: '#', time: 'Vor 5 Stunden' },
  { id: 3, title: 'Binnenschifffahrt-Report', url: '#', time: 'Gestern' },
];

export default function IndustrialDashboard() {
  const isAlert = CURRENT_LEVEL < THRESHOLD;
  
  // Chart calculation
  const { chartData, min, max } = useMemo(() => {
    const minLevel = Math.min(...HISTORY.map(d => d.level), THRESHOLD - 10);
    const maxLevel = Math.max(...HISTORY.map(d => d.level), THRESHOLD + 10);
    const range = maxLevel - minLevel;
    
    const data = HISTORY.map((d, i) => {
      const x = (i / (HISTORY.length - 1)) * 100;
      const y = 100 - (((d.level - minLevel) / range) * 100);
      return { x, y, level: d.level };
    });
    
    return { chartData: data, min: minLevel, max: maxLevel };
  }, []);

  const pathD = useMemo(() => {
    if (chartData.length === 0) return '';
    const moveTo = `M ${chartData[0].x} ${chartData[0].y}`;
    const lines = chartData.slice(1).map(d => `L ${d.x} ${d.y}`).join(' ');
    return `${moveTo} ${lines}`;
  }, [chartData]);
  
  const areaD = useMemo(() => {
    if (chartData.length === 0) return '';
    return `${pathD} L 100 100 L 0 100 Z`;
  }, [pathD]);

  const thresholdY = 100 - (((THRESHOLD - min) / (max - min)) * 100);

  return (
    <div className="industrial-dashboard">
      <div className="ind-grid">
        {/* SIDEBAR */}
        <aside className="ind-sidebar">
          <div className="ind-panel flex items-center gap-3">
            <div className={`p-2 rounded ${isAlert ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
              <Waves size={20} />
            </div>
            <div>
              <h1 className="font-mono text-sm font-bold tracking-wider uppercase">Reffenthal</h1>
              <p className="text-[10px] text-slate-500 font-mono tracking-widest uppercase">System Control</p>
            </div>
          </div>
          
          <div className="ind-panel">
            <div className="ind-label">
              <Activity size={14} /> System Status
            </div>
            <div className="flex items-center gap-3 mt-4">
              <div className={`ind-status-dot ${isAlert ? 'alert' : ''}`} />
              <div className="font-mono text-sm">
                {isAlert ? 'THRESHOLD BREACH' : 'NOMINAL'}
              </div>
            </div>
            <div className="mt-4 text-xs font-mono text-slate-500 space-y-2">
              <div className="flex justify-between">
                <span>LAST SCAN:</span>
                <span className="text-slate-300">2m ago</span>
              </div>
              <div className="flex justify-between">
                <span>NEXT SCAN:</span>
                <span className="text-slate-300">0m 45s</span>
              </div>
              <div className="flex justify-between">
                <span>UPTIME:</span>
                <span className="text-slate-300">99.9%</span>
              </div>
            </div>
          </div>

          <div className="ind-panel">
            <div className="ind-label">
              <HardDrive size={14} /> Parameters
            </div>
            <div className="mt-4 space-y-4">
              <div>
                <div className="text-[10px] font-mono text-slate-500 uppercase">Target Node</div>
                <div className="font-mono text-sm mt-1">Speyer / Rhein</div>
              </div>
              <div>
                <div className="text-[10px] font-mono text-slate-500 uppercase">Alert Threshold</div>
                <div className="font-mono text-sm mt-1 flex items-end gap-1">
                  <span className="text-xl">{THRESHOLD}</span> <span className="text-slate-500">cm</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="mt-auto p-4">
            <button className="ind-button w-full flex items-center justify-center gap-2">
              <RefreshCcw size={14} /> FORCE RE-SCAN
            </button>
          </div>
        </aside>

        {/* MAIN AREA */}
        <main className="ind-main">
          {/* HEADER METRIC */}
          <div className="ind-panel flex flex-col md:flex-row md:items-end justify-between gap-6" style={{ background: isAlert ? 'var(--accent-alert-glow)' : 'transparent' }}>
            <div>
              <div className="ind-label">
                Current Water Level
              </div>
              <div className="flex items-baseline gap-2 mt-2">
                <div className="ind-value huge" style={{ color: isAlert ? 'var(--accent-alert)' : 'var(--accent-normal)' }}>
                  {CURRENT_LEVEL}
                </div>
                <div className="font-mono text-xl text-slate-500">cm</div>
              </div>
            </div>
            {isAlert && (
              <div className="flex items-center gap-2 text-red-500 font-mono text-sm border border-red-500/30 bg-red-500/10 px-4 py-2 rounded">
                <AlertTriangle size={16} />
                CRITICAL LEVEL DETECTED
              </div>
            )}
          </div>

          {/* CHART */}
          <div className="ind-chart-container">
            <div className="ind-label mb-4">48-Hour Telemetry</div>
            
            {/* SVG Chart */}
            <svg className="ind-chart-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
              <defs>
                <linearGradient id="chart-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={isAlert ? 'var(--accent-alert)' : 'var(--accent-normal)'} stopOpacity="0.3" />
                  <stop offset="100%" stopColor={isAlert ? 'var(--accent-alert)' : 'var(--accent-normal)'} stopOpacity="0" />
                </linearGradient>
              </defs>
              
              {/* Grid lines */}
              <line x1="0" y1="25" x2="100" y2="25" stroke="var(--border)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
              <line x1="0" y1="50" x2="100" y2="50" stroke="var(--border)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
              <line x1="0" y1="75" x2="100" y2="75" stroke="var(--border)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
              
              {/* Threshold line */}
              <line 
                x1="0" 
                y1={thresholdY} 
                x2="100" 
                y2={thresholdY} 
                className="ind-chart-threshold" 
              />
              
              {/* Area */}
              <path d={areaD} className="ind-chart-area" />
              
              {/* Line */}
              <path 
                d={pathD} 
                className="ind-chart-line" 
                style={{ stroke: isAlert ? 'var(--accent-alert)' : 'var(--accent-normal)' }} 
              />
            </svg>
            
            {/* Chart Overlays */}
            <div className="absolute top-0 right-0 h-full w-full pointer-events-none">
              <div 
                className="absolute right-0 text-[10px] font-mono text-red-500 transform -translate-y-1/2 pr-2"
                style={{ top: `calc(${thresholdY}% + 1.5rem)` }}
              >
                TGT: {THRESHOLD}cm
              </div>
            </div>
            
            <div className="flex justify-between mt-2 font-mono text-[10px] text-slate-500">
              <span>-48H</span>
              <span>-24H</span>
              <span>NOW</span>
            </div>
          </div>

          {/* EVENTS TABLE */}
          <div className="ind-panel border-t border-border flex-1">
            <div className="ind-label flex justify-between">
              <span><Activity size={14} className="inline mr-2" /> Recent Mentions</span>
              <span className="text-slate-500">{TREFFER.length} HITS</span>
            </div>
            <div className="mt-4 overflow-auto">
              <table className="ind-table">
                <thead>
                  <tr>
                    <th>TIME</th>
                    <th>SOURCE / EVENT</th>
                    <th className="text-right">ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {TREFFER.map(t => (
                    <tr key={t.id}>
                      <td className="w-32 text-slate-400">{t.time}</td>
                      <td>{t.title}</td>
                      <td className="text-right">
                        <a href={t.url} className="inline-flex items-center gap-1 text-emerald-500 hover:text-emerald-400">
                          VIEW <ExternalLink size={12} />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}
