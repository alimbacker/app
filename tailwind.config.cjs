/** Theme colors are CSS variables (space-separated RGB) so dark/light themes swap at runtime. */
const v = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [require('path').join(__dirname, 'src/renderer/**/*.{html,ts,tsx}')],
  darkMode: ['class'],
  theme: {
    extend: {
      colors: {
        base: v('base'),
        rail: v('rail'),
        card: v('card'),
        raised: v('raised'),
        sunken: v('sunken'),
        line: v('line'),
        ink: v('ink'),
        muted: v('muted'),
        faint: v('faint'),
        teal: { DEFAULT: v('teal'), strong: v('teal-strong'), soft: v('teal-soft'), ink: v('teal-ink') },
        sky: { DEFAULT: v('sky'), soft: v('sky-soft') },
        honey: { DEFAULT: v('honey'), soft: v('honey-soft') },
        ok: { DEFAULT: v('ok'), soft: v('ok-soft') },
        warn: { DEFAULT: v('warn'), soft: v('warn-soft') },
        danger: { DEFAULT: v('danger'), soft: v('danger-soft') },
        rarity: {
          common: v('r-common'),
          uncommon: v('r-uncommon'),
          rare: v('r-rare'),
          epic: v('r-epic'),
          legendary: v('r-legendary'),
          mythic: v('r-mythic'),
        },
      },
      fontFamily: {
        display: ['"Unbounded Variable"', '"Segoe UI Variable Display"', '"Segoe UI"', 'sans-serif'],
        sans: ['"Figtree Variable"', '"Segoe UI Variable Text"', '"Segoe UI"', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        lift: '0 1px 0 rgb(255 255 255 / 0.04) inset, 0 10px 30px -18px rgb(3 8 20 / 0.7)',
        pop: '0 18px 50px -20px rgb(3 8 20 / 0.8), 0 0 0 1px rgb(var(--c-line) / 1)',
        glow: '0 0 0 3px rgb(var(--c-teal) / 0.28)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'rise-in': { from: { opacity: '0', transform: 'translateY(6px) scale(.98)' }, to: { opacity: '1', transform: 'none' } },
        'pulse-soft': { '0%,100%': { opacity: '1' }, '50%': { opacity: '.55' } },
      },
      animation: {
        'fade-in': 'fade-in .18s ease-out both',
        'rise-in': 'rise-in .22s cubic-bezier(.2,.8,.2,1) both',
        'pulse-soft': 'pulse-soft 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
