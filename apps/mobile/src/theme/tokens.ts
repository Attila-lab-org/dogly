/**
 * Design tokens — UX_REFERENCE V1 (app chiara, cliente-first).
 * Logo Dogly = splash / app icon, non stampato sulle schermate quotidiane.
 */

export const colors = {
  background: '#F4F7FB',
  surface: '#FFFFFF',
  surfaceMuted: '#F1F5F9',

  primary: '#2563EB',
  primaryPressed: '#1D4ED8',
  primaryBright: '#38BDF8',
  primarySoft: '#DBEAFE',

  accent: '#14B8A6',
  accentPressed: '#0D9488',
  accentSoft: '#CCFBF1',

  text: '#0E2A47',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  textOnPrimary: '#FFFFFF',

  danger: '#EF4444',
  dangerPressed: '#DC2626',
  dangerSoft: '#FEE2E2',

  success: '#22C55E',
  successSoft: '#DCFCE7',
  warning: '#F59E0B',
  warningSoft: '#FEF3C7',

  border: '#E2E8F0',
  overlay: 'rgba(14, 42, 71, 0.4)',
  overlayDark: 'rgba(14, 42, 71, 0.7)',
  overlayLight: 'rgba(255, 255, 255, 0.4)',
  iconHighlight: '#F5C518',
} as const;

export const gradients = {
  cta: [colors.primary, colors.primaryBright] as const,
  header: [colors.primary, colors.primaryBright] as const,
} as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 16,
  lg: 24,
  full: 9999,
} as const;

export const typography = {
  size: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 22,
    xxl: 28,
    display: 34,
  },
  weight: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.4,
    relaxed: 1.6,
  },
} as const;

export const shadows = {
  card: {
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  raised: {
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 6,
  },
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
} as const;

export const tabBar = {
  activeTint: colors.primary,
  inactiveTint: colors.textMuted,
  background: colors.surface,
} as const;

export type ColorToken = keyof typeof colors;

export const tokens = {
  colors,
  gradients,
  spacing,
  radius,
  typography,
  shadows,
  tabBar,
} as const;

export default tokens;
