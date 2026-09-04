/**
 * Design tokens centralizzati — fonte unica per colori, spacing, radius,
 * tipografia e ombre. Derivati da docs/ux/UX_REFERENCE.md (design language
 * vincolante) e dai mockup ufficiali.
 *
 * REGOLA: nessun valore visuale hard-coded nei componenti/schermate.
 * Ogni valore deve venire da qui.
 */

export const colors = {
  /** Sfondo app: chiaro, tinta fredda */
  background: '#F4F7FB',
  /** Card / superfici */
  surface: '#FFFFFF',
  /** Card secondaria / righe evidence */
  surfaceMuted: '#F1F5F9',

  /** Blu primario (bottoni pieni, tab attivo, link) */
  primary: '#2563EB',
  /** Blu primario premuto / hover */
  primaryPressed: '#1D4ED8',
  /** Azzurro: estremo chiaro del gradiente CTA */
  primaryBright: '#38BDF8',
  /** Sfondo pill/confidenza azzurro chiaro */
  primarySoft: '#DBEAFE',

  /** Accento teal: icone, progress bar, chip, outline secondari */
  accent: '#14B8A6',
  accentPressed: '#0D9488',
  accentSoft: '#CCFBF1',

  /** Testo principale navy scuro */
  text: '#0E2A47',
  /** Testo secondario grigio */
  textSecondary: '#64748B',
  /** Testo terziario / placeholder */
  textMuted: '#94A3B8',
  /** Testo su sfondi scuri/gradiente */
  textOnPrimary: '#FFFFFF',

  /** Rosso/corallo per feedback negativo e azioni distruttive */
  danger: '#EF4444',
  dangerPressed: '#DC2626',
  dangerSoft: '#FEE2E2',

  /** Successo (chip "Relax", stati positivi) */
  success: '#22C55E',
  successSoft: '#DCFCE7',
  /** Attenzione (chip salmone, warning) */
  warning: '#F59E0B',
  warningSoft: '#FEF3C7',

  /** Bordi sottili */
  border: '#E2E8F0',
  /** Overlay modali */
  overlay: 'rgba(14, 42, 71, 0.4)',
} as const;

/** Gradiente CTA dominante blu → azzurro (card "Capisci Rocky", header profilo) */
export const gradients = {
  cta: [colors.primary, colors.primaryBright] as const,
  header: [colors.primary, colors.primaryBright] as const,
} as const;

/** Spacing scale (base 4) */
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

/** Radius: card bianche grandi (16–24) come da mockup */
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

/** Ombre morbide per card bianche */
export const shadows = {
  card: {
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
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

/** Tab bar: 3 voci (UX LOCK), attivo blu */
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
