/** @type {import('tailwindcss').Config} */

// Every colour is a CSS variable (see src/index.css) so light and dark
// themes swap from one place. Values are "R G B" triplets so Tailwind's
// opacity modifiers (bg-brand/10, border-line/60) keep working.
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: token('canvas'), // page background — the auditorium walls
        surface: token('surface'), // cards, dialogs
        raised: token('raised'), // inputs, nested panels
        line: token('line'), // hairlines and borders
        ink: { DEFAULT: token('ink'), muted: token('ink-muted') },
        brand: { DEFAULT: token('brand'), hover: token('brand-hover') }, // velvet-seat red
        'on-brand': token('on-brand'), // text placed on brand fills
        danger: token('danger'),
        success: token('success'),
      },
      fontFamily: {
        display: ['"Big Shoulders Display"', 'Impact', 'sans-serif'],
        body: ['Figtree', 'system-ui', 'sans-serif'],
        sans: ['Figtree', 'system-ui', 'sans-serif'],
        // Kept as an alias so older markup still renders; scores use tabular figures.
        mono: ['Figtree', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl: '12px',
        '2xl': '18px',
      },
      boxShadow: {
        dialog: '0 24px 60px -12px rgb(var(--shadow) / 0.55)',
        poster: '0 12px 28px -10px rgb(var(--shadow) / 0.6)',
      },
      keyframes: {
        'dialog-in': {
          from: { opacity: '0', transform: 'translateY(8px) scale(0.98)' },
          to: { opacity: '1', transform: 'none' },
        },
      },
      animation: {
        'dialog-in': 'dialog-in 180ms cubic-bezier(.2,.8,.2,1)',
      },
    },
  },
  plugins: [],
}
