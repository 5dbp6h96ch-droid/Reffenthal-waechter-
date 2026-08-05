/**
 * Design tokens derived from the sibling Reffenthal Dashboard web artifact.
 * Color theme: "Pegelkarte" — warm survey-chart paper, petrol ink, reed green / brick red status.
 * Font: Space Grotesk.
 */

const colors = {
  light: {
    // Legacy aliases
    text: '#0D2228',
    tint: '#143D45',

    background: '#EFE8DA',       // hsl(42 28% 94%)  — warm survey paper
    foreground: '#0D2228',       // hsl(197 42% 12%) — dark petrol

    card: '#F7F4ED',             // hsl(40 33% 97%)  — near-white paper
    cardForeground: '#0D2228',

    primary: '#143D45',          // hsl(191 62% 22%) — deep petrol teal
    primaryForeground: '#F5F1E8',

    secondary: '#DDD5C5',        // hsl(36 30% 88%)  — warm grey
    secondaryForeground: '#1A3540',

    muted: '#E1D9CA',            // hsl(38 22% 89%)  — muted paper
    mutedForeground: '#516970',  // hsl(197 15% 38%) — subdued text

    accent: '#C96C18',           // hsl(32 70% 47%)  — amber orange
    accentForeground: '#F5F1E8',

    destructive: '#AE2B1C',      // hsl(7 68% 42%)   — brick red
    destructiveForeground: '#F5F1E8',

    border: '#CEC4B0',           // hsl(40 20% 82%)  — warm border
    input: '#CEC4B0',

    // Domain-specific status tokens
    safe: '#2B6444',             // hsl(152 42% 30%) — reed green
    safeForeground: '#F5F1E8',
    alarm: '#AE2B1C',            // hsl(7 68% 42%)   — brick red
    alarmForeground: '#F5F1E8',

    // Chart colors
    chartLine: '#2E6B4C',        // hsl(152 42% 34%) — chart green
    chartLineAlarm: '#B43020',   // hsl(7 68% 45%)   — chart red
  },

  dark: {
    text: '#EDE6D9',
    tint: '#4BA3B5',

    background: '#0D2228',       // hsl(197 42% 12%)
    foreground: '#EDE6D9',       // hsl(42 25% 92%)

    card: '#142E38',
    cardForeground: '#EDE6D9',

    primary: '#4BA3B5',
    primaryForeground: '#0D2228',

    secondary: '#1E3E48',
    secondaryForeground: '#EDE6D9',

    muted: '#1A3540',
    mutedForeground: '#7FA8B0',

    accent: '#D97E30',
    accentForeground: '#0D2228',

    destructive: '#C44030',
    destructiveForeground: '#F5F1E8',

    border: '#1E3E48',
    input: '#1E3E48',

    safe: '#3A8A5C',
    safeForeground: '#0D2228',
    alarm: '#C44030',
    alarmForeground: '#F5F1E8',

    chartLine: '#3A8A5C',
    chartLineAlarm: '#C44030',
  },

  // Border radius synced from web --radius: 0.625rem
  radius: 10,
};

export default colors;
