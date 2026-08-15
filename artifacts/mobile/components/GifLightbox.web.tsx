/**
 * GifLightbox.web.tsx – Vollbild-Lightbox für das Vorhersage-GIF (nur Web).
 *
 * - Wird per React-Portal direkt in document.body gerendert. Dadurch ist
 *   position:fixed garantiert viewport-relativ (auf iOS Safari kann ein
 *   transformierter Vorfahre "fixed" sonst an die Karte binden → Overlay
 *   landet außerhalb des sichtbaren Bereichs).
 * - Pinch-to-Zoom (2 Finger), Pan (1 Finger bei Zoom > 1) und Doppeltippen
 *   (wechselt zwischen 1× und 2,5×) NUR innerhalb des Overlays.
 *   Die globale Zoom-Sperre der Seite bleibt unangetastet – hier wird per
 *   CSS-Transform nur das <img> skaliert, nie die Seite.
 * - Das X liegt außerhalb der transformierten Fläche und bleibt daher
 *   immer sichtbar/erreichbar (Safe-Area-Abstände via env()).
 * - Beim Schließen wird die Komponente entfernt → Zoom/Pan-Zustand ist
 *   automatisch zurückgesetzt.
 * - Das GIF wird unverändert als <img> geladen – Animation bleibt erhalten.
 */

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  uri: string;
  onClose: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;
const DOUBLE_TAP_MS = 300;

export default function GifLightbox({ uri, onClose }: Props) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Zoom/Pan-Zustand als Refs (Transform wird direkt am DOM gesetzt – flüssig,
  // keine React-Re-Renders pro Fingerbewegung nötig).
  const scaleRef = useRef(1);
  const txRef = useRef(0);
  const tyRef = useRef(0);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ dist: number; scale: number } | null>(null);
  const panStart = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const lastTap = useRef(0);

  useEffect(() => {
    // Hintergrund-Scroll sperren, solange das Overlay offen ist.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const applyTransform = () => {
    const img = imgRef.current;
    if (!img) return;
    // Pan begrenzen, damit das GIF nicht komplett aus dem Bild geschoben wird.
    const s = scaleRef.current;
    const maxX = (img.clientWidth * (s - 1)) / 2;
    const maxY = (img.clientHeight * (s - 1)) / 2;
    txRef.current = Math.max(-maxX, Math.min(maxX, txRef.current));
    tyRef.current = Math.max(-maxY, Math.min(maxY, tyRef.current));
    img.style.transform =
      `translate(${txRef.current}px, ${tyRef.current}px) scale(${s})`;
  };

  const setScale = (next: number) => {
    scaleRef.current = Math.max(MIN_SCALE, Math.min(MAX_SCALE, next));
    if (scaleRef.current === 1) { txRef.current = 0; tyRef.current = 0; }
    applyTransform();
  };

  const dist = () => {
    const pts = Array.from(pointers.current.values());
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    if (pointers.current.size === 2) {
      pinchStart.current = { dist: dist(), scale: scaleRef.current };
      panStart.current = null;
    } else if (pointers.current.size === 1) {
      panStart.current = {
        x: e.clientX, y: e.clientY, tx: txRef.current, ty: tyRef.current,
      };
      // Doppeltippen: 1× ↔ 2,5×
      const now = Date.now();
      if (now - lastTap.current < DOUBLE_TAP_MS) {
        setScale(scaleRef.current > 1 ? 1 : DOUBLE_TAP_SCALE);
        lastTap.current = 0;
      } else {
        lastTap.current = now;
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinchStart.current) {
      const d = dist();
      if (pinchStart.current.dist > 0 && d > 0) {
        setScale(pinchStart.current.scale * (d / pinchStart.current.dist));
      }
    } else if (pointers.current.size === 1 && panStart.current && scaleRef.current > 1) {
      txRef.current = panStart.current.tx + (e.clientX - panStart.current.x);
      tyRef.current = panStart.current.ty + (e.clientY - panStart.current.y);
      applyTransform();
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) panStart.current = null;
  };

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 100000,
        backgroundColor: 'rgba(0,0,0,0.9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
      ref={(el) => {
        stageRef.current = el;
        // 100dvh, wo unterstützt (iOS: dynamische Toolbar).
        if (el && typeof CSS !== 'undefined' && CSS.supports?.('height', '100dvh')) {
          el.style.height = '100dvh';
        }
      }}
    >
      {/* Zoombare Fläche – Pointer-Events nur hier, touch-action:none
          überschreibt die globale pan-x/pan-y-Regel LOKAL im Overlay. */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          touchAction: 'none',
          paddingTop: 'max(env(safe-area-inset-top), 10px)',
          paddingBottom: 'max(env(safe-area-inset-bottom), 10px)',
          paddingLeft: 'max(env(safe-area-inset-left), 8px)',
          paddingRight: 'max(env(safe-area-inset-right), 8px)',
          boxSizing: 'border-box',
        }}
      >
        <img
          ref={imgRef}
          src={uri}
          alt="Vorhersage"
          draggable={false}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            borderRadius: 8,
            userSelect: 'none',
            transformOrigin: 'center center',
            willChange: 'transform',
          }}
        />
      </div>

      {/* X – außerhalb der Zoom-Fläche, immer sichtbar, Safe-Area beachtet */}
      <button
        onClick={onClose}
        aria-label="Schließen"
        style={{
          position: 'absolute',
          top: 'calc(max(env(safe-area-inset-top), 10px) + 6px)',
          right: 'calc(max(env(safe-area-inset-right), 10px) + 6px)',
          width: 44,
          height: 44,
          borderRadius: 22,
          border: 'none',
          backgroundColor: 'rgba(255,255,255,0.22)',
          color: '#FFFFFF',
          fontSize: 20,
          lineHeight: '22px',
          cursor: 'pointer',
          zIndex: 100001,
          touchAction: 'manipulation',
        }}
      >
        ✕
      </button>
    </div>,
    document.body,
  );
}
