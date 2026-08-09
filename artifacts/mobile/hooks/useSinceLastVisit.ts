/**
 * useSinceLastVisit – „Seit deinem letzten Besuch"
 *
 * Vergleicht NfB-, Pegel- und MCK-Daten mit dem zuletzt gespeicherten Stand
 * (AsyncStorage) und gibt eine Liste von Änderungen zurück.
 *
 * Regeln:
 * - Erster Besuch: kein Vergleich, nur aktuellen Stand speichern.
 * - Offline / Fehler: kein Vergleich, Storage nicht überschreiben.
 * - Jede Datenquelle wird unabhängig verglichen und gespeichert.
 * - Pro Session wird jede Quelle genau einmal verglichen (Ref-Guard).
 * - Kein Server, keine externe ID, keine PII – alles lokal.
 */
import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Storage keys ──────────────────────────────────────────────────────────────
const KEY_NFB_IDS    = 'rsv_nfb_ids';     // JSON string[]
const KEY_PEGEL_CM   = 'rsv_pegel_cm';    // number string
const KEY_MCK_PETROL = 'rsv_mck_petrol';  // number string
const KEY_MCK_DIESEL = 'rsv_mck_diesel';  // number string

/** Mindestabweichung am Pegel, damit eine Änderung angezeigt wird. */
const PEGEL_MIN_DELTA_CM = 2;

// ── Public types ──────────────────────────────────────────────────────────────
export type VisitChange =
  | { kind: 'nfb';   newCount: number }
  | { kind: 'pegel'; oldCm: number; newCm: number; deltaCm: number }
  | { kind: 'mck';
      oldPetrol: number | null; newPetrol: number | null;
      oldDiesel: number | null; newDiesel: number | null;
    };

// Minimale Typen – kompatibel mit den existierenden NfbMeldung / MckData-Typen
export type NfbMeldungMin = { nfb_id: string; expired?: boolean };
export type MckDataMin    = { petrol: number | null; diesel: number | null };

// ── Stored snapshot ───────────────────────────────────────────────────────────
type StoredSnapshot = {
  nfbIds:    string[] | null;   // null → noch nie gespeichert
  pegelCm:   number  | null;
  mckPetrol: number  | null;
  mckDiesel: number  | null;
  isFirstVisit: boolean;        // true wenn KEIN einziger Schlüssel gespeichert war
};

async function loadSnapshot(): Promise<StoredSnapshot> {
  const [nfbIdsStr, pegelCmStr, petrolStr, dieselStr] = await Promise.all([
    AsyncStorage.getItem(KEY_NFB_IDS),
    AsyncStorage.getItem(KEY_PEGEL_CM),
    AsyncStorage.getItem(KEY_MCK_PETROL),
    AsyncStorage.getItem(KEY_MCK_DIESEL),
  ]);
  const isFirstVisit =
    nfbIdsStr === null && pegelCmStr === null && petrolStr === null && dieselStr === null;
  return {
    nfbIds:    nfbIdsStr  !== null ? (JSON.parse(nfbIdsStr) as string[]) : null,
    pegelCm:   pegelCmStr !== null ? Number(pegelCmStr) : null,
    mckPetrol: petrolStr  !== null ? Number(petrolStr)  : null,
    mckDiesel: dieselStr  !== null ? Number(dieselStr)  : null,
    isFirstVisit,
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────
/**
 * @param nfbMeldungen  Aktuelle NfB-Liste (undefined = noch nicht geladen)
 * @param nfbOk         true wenn NfB erfolgreich geladen (kein Fehler, nicht am Laden)
 * @param currentCm     Aktueller Pegelstand in cm (null = unbekannt)
 * @param pegelOk       true wenn Pegel erfolgreich geladen
 * @param mckData       Aktuelle MCK-Tankdaten (undefined = noch nicht geladen)
 * @param mckOk         true wenn MCK erfolgreich geladen
 */
export function useSinceLastVisit(
  nfbMeldungen: NfbMeldungMin[] | undefined,
  nfbOk: boolean,
  currentCm: number | null,
  pegelOk: boolean,
  mckData: MckDataMin | undefined,
  mckOk: boolean,
): VisitChange[] {
  const [changes, setChanges] = useState<VisitChange[]>([]);

  // Geladener Snapshot – null = Storage wird noch gelesen
  const [stored, setStored] = useState<StoredSnapshot | null>(null);

  // Pro-Quelle-Guard: verhindert mehrfachen Vergleich pro Session
  const nfbDone   = useRef(false);
  const pegelDone = useRef(false);
  const mckDone   = useRef(false);

  // 1. Storage einmalig laden
  useEffect(() => {
    loadSnapshot()
      .then(setStored)
      .catch(() => {
        // Storage nicht verfügbar → wie Erstbesuch behandeln
        setStored({
          nfbIds: null, pegelCm: null, mckPetrol: null, mckDiesel: null,
          isFirstVisit: true,
        });
      });
  }, []);

  // 2a. NfB-Vergleich
  useEffect(() => {
    if (stored === null || nfbDone.current || !nfbOk || nfbMeldungen === undefined) return;
    nfbDone.current = true;

    const currentIds = nfbMeldungen.filter(m => !m.expired).map(m => m.nfb_id);

    if (!stored.isFirstVisit && stored.nfbIds !== null) {
      const prevSet = new Set(stored.nfbIds);
      const newIds  = currentIds.filter(id => !prevSet.has(id));
      if (newIds.length > 0) {
        setChanges(prev => [...prev, { kind: 'nfb', newCount: newIds.length }]);
      }
    }

    // Aktuellen Stand speichern
    AsyncStorage.setItem(KEY_NFB_IDS, JSON.stringify(currentIds)).catch(() => {});
  }, [stored, nfbOk, nfbMeldungen]);

  // 2b. Pegel-Vergleich
  useEffect(() => {
    if (stored === null || pegelDone.current || !pegelOk || currentCm === null) return;
    pegelDone.current = true;

    if (!stored.isFirstVisit && stored.pegelCm !== null) {
      const delta = currentCm - stored.pegelCm;
      if (Math.abs(delta) >= PEGEL_MIN_DELTA_CM) {
        setChanges(prev => [
          ...prev,
          { kind: 'pegel', oldCm: stored.pegelCm!, newCm: currentCm, deltaCm: delta },
        ]);
      }
    }

    AsyncStorage.setItem(KEY_PEGEL_CM, String(currentCm)).catch(() => {});
  }, [stored, pegelOk, currentCm]);

  // 2c. MCK-Vergleich
  useEffect(() => {
    if (stored === null || mckDone.current || !mckOk || mckData === undefined) return;
    mckDone.current = true;

    const { petrol, diesel } = mckData;
    const petrolChanged = petrol !== null && stored.mckPetrol !== null && petrol !== stored.mckPetrol;
    const dieselChanged = diesel !== null && stored.mckDiesel !== null && diesel !== stored.mckDiesel;

    if (!stored.isFirstVisit && (petrolChanged || dieselChanged)) {
      setChanges(prev => [
        ...prev,
        {
          kind: 'mck',
          oldPetrol: stored.mckPetrol,
          newPetrol: petrol ?? null,
          oldDiesel: stored.mckDiesel,
          newDiesel: diesel ?? null,
        },
      ]);
    }

    if (petrol !== null) AsyncStorage.setItem(KEY_MCK_PETROL, String(petrol)).catch(() => {});
    if (diesel !== null) AsyncStorage.setItem(KEY_MCK_DIESEL, String(diesel)).catch(() => {});
  }, [stored, mckOk, mckData]);

  return changes;
}
