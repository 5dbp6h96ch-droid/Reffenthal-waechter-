/**
 * Design tokens — Apple Human Interface Guidelines inspired.
 * Color theme: "Rhein Infos" — clean iOS light blue, system colors, generous radius.
 * Font: Space Grotesk (SF Pro-like in weight distribution).
 */

const colors = {
  light: {
    // Legacy aliases
    text: '#1C1C1E',
    tint: '#007AFF',

    background: '#EBF3FC',         // soft sky blue background
    foreground: '#1C1C1E',         // iOS near-black

    card: '#FFFFFF',               // pure white cards
    cardForeground: '#1C1C1E',

    primary: '#007AFF',            // iOS System Blue
    primaryForeground: '#FFFFFF',

    secondary: '#DCEcFA',          // pale blue
    secondaryForeground: '#1C1C1E',

    muted: '#F0F7FF',              // barely-blue muted surface
    mutedForeground: '#8E8E93',    // iOS Gray

    accent: '#FF9500',             // iOS Orange — threshold indicator
    accentForeground: '#FFFFFF',

    destructive: '#FF3B30',        // iOS Red
    destructiveForeground: '#FFFFFF',

    border: '#C8DFF7',             // light blue border
    input: '#C8DFF7',

    // Domain-specific status tokens
    safe: '#34C759',               // iOS Green
    safeForeground: '#FFFFFF',
    alarm: '#FF3B30',              // iOS Red
    alarmForeground: '#FFFFFF',

    // Chart colors
    chartLine: '#34C759',
    chartLineAlarm: '#FF3B30',
  },

  dark: {
    text: '#EBEBF5',
    tint: '#0A84FF',

    background: '#0A1929',         // deep navy
    foreground: '#EBEBF5',

    card: '#152233',
    cardForeground: '#EBEBF5',

    primary: '#0A84FF',            // iOS Blue (dark)
    primaryForeground: '#FFFFFF',

    secondary: '#1A2E44',
    secondaryForeground: '#EBEBF5',

    muted: '#112030',
    mutedForeground: '#98989F',    // iOS Gray (dark)

    accent: '#FF9F0A',             // iOS Orange (dark)
    accentForeground: '#000000',

    destructive: '#FF453A',        // iOS Red (dark)
    destructiveForeground: '#FFFFFF',

    border: '#1A2E44',
    input: '#1A2E44',

    safe: '#32D74B',               // iOS Green (dark)
    safeForeground: '#000000',
    alarm: '#FF453A',              // iOS Red (dark)
    alarmForeground: '#FFFFFF',

    chartLine: '#32D74B',
    chartLineAlarm: '#FF453A',
  },

  // Apple-style generous radius
  radius: 14,
};

export default colors;
