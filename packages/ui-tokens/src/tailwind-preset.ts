import { colors } from './colors';
import { shadows } from './spacing';

const preset = {
  theme: {
    extend: {
      colors: {
        surface: {
          primary: colors.background.primary,
          secondary: colors.background.secondary,
          tertiary: colors.background.tertiary,
        },
        'border-subtle': colors.border.subtle,
        'border-focus': colors.border.focus,
        accent: {
          blue: colors.accent.blue,
          'blue-hover': colors.accent.blueHover,
          'blue-light': colors.accent.blueLight,
          green: colors.accent.green,
          'green-hover': colors.accent.greenHover,
          'green-light': colors.accent.greenLight,
          yellow: colors.accent.yellow,
          'yellow-light': colors.accent.yellowLight,
          red: colors.accent.red,
          'red-hover': colors.accent.redHover,
          'red-light': colors.accent.redLight,
          purple: colors.accent.purple,
          'purple-light': colors.accent.purpleLight,
        },
        status: colors.status,
      },
      boxShadow: {
        card: shadows.card,
        'card-hover': shadows.cardHover,
        focus: shadows.focus,
      },
      fontFamily: {
        sans: ["'Inter'", '-apple-system', 'BlinkMacSystemFont', "'Segoe UI'", 'Roboto', 'sans-serif'],
        mono: ["'JetBrains Mono'", "'SF Mono'", "'Fira Code'", 'monospace'],
      },
      borderRadius: {
        DEFAULT: '0.5rem',
        card: '0.75rem',
      },
      animation: {
        'fade-in': 'fadeIn 250ms cubic-bezier(0.4, 0, 0.2, 1)',
        'slide-up': 'slideUp 300ms cubic-bezier(0, 0, 0.2, 1)',
        'slide-down': 'slideDown 300ms cubic-bezier(0, 0, 0.2, 1)',
        'scale-in': 'scaleIn 200ms cubic-bezier(0, 0, 0.2, 1)',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(10px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        slideDown: { '0%': { opacity: '0', transform: 'translateY(-10px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        scaleIn: { '0%': { opacity: '0', transform: 'scale(0.95)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
      },
    },
  },
};

export default preset;
