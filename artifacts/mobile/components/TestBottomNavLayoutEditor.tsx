import React, { useState } from 'react';

/** Test-only visual editor for the bottom navigation.
 * It is intentionally a standalone component so it can be wired into the test screen
 * without touching production layout code.
 */
export default function TestBottomNavLayoutEditor() {
  const [height, setHeight] = useState(30);
  const [top, setTop] = useState(5);
  const [bottom, setBottom] = useState(2);
  const [icon, setIcon] = useState(17);
  const [gap, setGap] = useState(2);
  const [font, setFont] = useState(10);

  const control = (label: string, value: number, setValue: (v: number) => void, min: number, max: number) => (
    <label style={{ display: 'grid', gridTemplateColumns: '120px 1fr 42px', alignItems: 'center', gap: 10, marginBottom: 10 }}>
      <span>{label}</span>
      <input type="range" min={min} max={max} value={value} onChange={e => setValue(Number(e.target.value))} />
      <strong>{value}px</strong>
    </label>
  );

  return (
    <div style={{ padding: 16, fontFamily: 'system-ui', background: '#fff', minHeight: '100vh' }}>
      <h2 style={{ marginTop: 0 }}>Bottom-Navigation – Test Layout</h2>
      <p style={{ marginTop: 0 }}>Die Regler verändern nur die visuelle Vorschau.</p>

      <div style={{ maxWidth: 420, margin: '24px auto', border: '1px solid #ccc', borderRadius: 16, overflow: 'hidden', background: '#f5f5f5' }}>
        <div style={{ height: 260, display: 'grid', placeItems: 'center', color: '#777' }}>App-Vorschau</div>
        <div style={{ borderTop: '1px solid #aaa', background: '#fff', height, paddingTop: top, paddingBottom: bottom, boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'flex-start', height: '100%' }}>
            {['⌂', '♒', '◉', '⚙'].map((symbol, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1, gap }}>
                <div style={{ width: icon, height: icon, fontSize: icon, display: 'grid', placeItems: 'center' }}>{symbol}</div>
                <span style={{ fontSize: font }}>{['Home', 'Pegel', 'News', 'Konto'][i]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {control('Menühöhe', height, setHeight, 20, 60)}
      {control('Abstand oben', top, setTop, 0, 15)}
      {control('Abstand unten', bottom, setBottom, 0, 15)}
      {control('Icon-Größe', icon, setIcon, 12, 24)}
      {control('Icon → Text', gap, setGap, 0, 8)}
      {control('Textgröße', font, setFont, 8, 14)}

      <div style={{ marginTop: 20, padding: 12, border: '1px solid #ddd', borderRadius: 10, background: '#fafafa' }}>
        <strong>Aktuelle Werte</strong>
        <pre style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify({ height, top, bottom, icon, gap, font }, null, 2)}</pre>
      </div>
    </div>
  );
}
