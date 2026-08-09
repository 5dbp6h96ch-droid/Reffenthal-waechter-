// Stub für native Builds – Karte ist nur im Web verfügbar.
// Expo löst auf Web automatisch RheinKarte.web.tsx auf.
// Die Props-Schnittstelle ist identisch mit der Web-Version damit TypeScript
// in index.tsx keine Fehler wirft (der Compiler sieht nur diesen Stub).

export interface RheinKarteProps {
  pegelCm: number | null;
  pegelTime: string | null;
  mckData?: {
    source: string;
    petrol: number | null;
    diesel: number | null;
    unit: string;
    sourceDate?: string | null;
  };
  knownClubs: { name: string; icon: string; url: string }[];
  nfbMeldungen: {
    nfb_id: string;
    titel: string;
    km_von: number | null;
    km_bis: number | null;
    gueltig_ab: string | null;
    gueltig_bis: string | null;
    url: string | null;
    expired?: boolean;
  }[];
  isOffline?: boolean;
  colors: object;
}

export default function RheinKarte(_props: RheinKarteProps) {
  return null;
}
