/**
 * database.ts – Supabase-Datenbanktypen für R(h)einschiffer
 *
 * Spiegelt die bestehende Supabase-Datenbankstruktur wider.
 * Kein Auto-Generierungsschritt nötig – Typen werden hier manuell gepflegt.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string | null;
          username: string | null;
          full_name: string | null;
          avatar_url: string | null;
        };
        Insert: {
          id: string;
          created_at?: string;
          updated_at?: string | null;
          username?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
        };
        Update: {
          updated_at?: string | null;
          username?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
        };
      };
      gauges: {
        Row: {
          id: string;
          name: string;
          river: string | null;
          river_km: number | null;
          pegel_nr: string | null;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          river?: string | null;
          river_km?: number | null;
          pegel_nr?: string | null;
          active?: boolean;
          created_at?: string;
        };
        Update: {
          name?: string;
          river?: string | null;
          river_km?: number | null;
          pegel_nr?: string | null;
          active?: boolean;
        };
      };
      user_settings: {
        Row: {
          user_id: string;
          selected_gauge_id: string | null;
          location_enabled: boolean;
          latitude: number | null;
          longitude: number | null;
          weather_enabled: boolean;
          push_enabled: boolean;
          created_at: string;
          updated_at: string | null;
        };
        Insert: {
          user_id: string;
          selected_gauge_id?: string | null;
          location_enabled?: boolean;
          latitude?: number | null;
          longitude?: number | null;
          weather_enabled?: boolean;
          push_enabled?: boolean;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: {
          selected_gauge_id?: string | null;
          location_enabled?: boolean;
          latitude?: number | null;
          longitude?: number | null;
          weather_enabled?: boolean;
          push_enabled?: boolean;
          updated_at?: string | null;
        };
      };
      user_gauge_settings: {
        Row: {
          id: string;
          user_id: string;
          gauge_id: string;
          alert_enabled: boolean;
          alert_threshold_cm: number | null;
          created_at: string;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          gauge_id: string;
          alert_enabled?: boolean;
          alert_threshold_cm?: number | null;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: {
          alert_enabled?: boolean;
          alert_threshold_cm?: number | null;
          updated_at?: string | null;
        };
      };
      push_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          endpoint: string;
          token: string | null;
          platform: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          endpoint: string;
          token?: string | null;
          platform?: string | null;
          created_at?: string;
        };
        Update: {
          endpoint?: string;
          token?: string | null;
          platform?: string | null;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

// Abgeleitete Komfort-Typen
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Gauge = Database['public']['Tables']['gauges']['Row'];
export type UserSettings = Database['public']['Tables']['user_settings']['Row'];
export type UserSettingsUpdate = Database['public']['Tables']['user_settings']['Update'];
export type UserGaugeSetting = Database['public']['Tables']['user_gauge_settings']['Row'];
export type UserGaugeSettingUpdate = Database['public']['Tables']['user_gauge_settings']['Update'];
export type PushSubscription = Database['public']['Tables']['push_subscriptions']['Row'];
