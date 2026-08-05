import { useColorScheme } from 'react-native';
import colors from '@/constants/colors';

type Palette = typeof colors.light;

/**
 * Returns the design tokens for the current color scheme.
 *
 * Falls back to the light palette when the device is in light mode or when
 * no dark theme is defined. If a `dark` key is present in constants/colors.ts
 * the hook will automatically switch based on the device's appearance setting.
 */
export function useColors(): Palette & { radius: number } {
  const scheme = useColorScheme();
  const palette: Palette =
    scheme === 'dark' ? colors.dark : colors.light;
  return { ...palette, radius: colors.radius };
}
