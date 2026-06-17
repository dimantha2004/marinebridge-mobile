import { MD3DarkTheme } from 'react-native-paper';

/**
 * Marianbridge design system — "Maritime-industrial".
 * Deep ocean authority meets operational precision.
 */
export const palette = {
  navyDeep: '#0A1628', // primary background, headers
  oceanMid: '#1B3A5C', // cards, panels
  steelBlue: '#2E6DA4', // primary action, links
  signalAmber: '#F59E0B', // pending / approval states
  engineGreen: '#10B981', // success, delivered, approved
  alertRed: '#EF4444', // rejected, declined, critical
  fogWhite: '#F0F4F8', // text on dark
  hullGray: '#64748B', // secondary text, borders
} as const;

export const fonts = {
  display: 'SpaceGrotesk_700Bold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemiBold: 'Inter_600SemiBold',
  mono: 'JetBrainsMono_500Medium',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

/**
 * React Native Paper MD3 theme override. Imported by the root PaperProvider.
 */
export const paperTheme = {
  ...MD3DarkTheme,
  roundness: 2,
  colors: {
    ...MD3DarkTheme.colors,
    primary: palette.steelBlue,
    onPrimary: palette.fogWhite,
    primaryContainer: palette.oceanMid,
    onPrimaryContainer: palette.fogWhite,
    secondary: palette.signalAmber,
    background: palette.navyDeep,
    onBackground: palette.fogWhite,
    surface: palette.oceanMid,
    onSurface: palette.fogWhite,
    surfaceVariant: '#15304D',
    onSurfaceVariant: palette.hullGray,
    outline: palette.hullGray,
    error: palette.alertRed,
    elevation: {
      level0: 'transparent',
      level1: '#13283F',
      level2: '#15304D',
      level3: '#1B3A5C',
      level4: '#1F4268',
      level5: '#234A74',
    },
  },
} as const;

export type AppTheme = typeof paperTheme;
