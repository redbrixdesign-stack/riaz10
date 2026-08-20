/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Design tokens — the single source of truth is src/index.css
      // (:root custom properties); this maps them into Tailwind utilities.
      colors: {
        ink: 'rgb(var(--color-ink) / <alpha-value>)',        // #121212 charcoal
        paper: 'rgb(var(--color-paper) / <alpha-value>)',    // #F7F6F2 off-white
        forest: 'rgb(var(--color-forest) / <alpha-value>)',  // #153D32 deep green
        sage: 'rgb(var(--color-sage) / <alpha-value>)',      // #DDEFE4 soft mint
        clay: 'rgb(var(--color-clay) / <alpha-value>)'       // #C07A53 muted amber
      },
      fontFamily: {
        sans: [
          '-apple-system', 'BlinkMacSystemFont', 'Inter', 'Manrope', 'Segoe UI',
          'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'
        ]
      },
      maxWidth: {
        prose: '34rem',
        section: '72rem'
      },
      boxShadow: {
        soft: '0 1px 2px rgba(18,18,18,0.04), 0 8px 24px rgba(18,18,18,0.06)',
        lift: '0 2px 6px rgba(18,18,18,0.06), 0 24px 60px rgba(18,18,18,0.12)'
      },
      transitionTimingFunction: {
        'out-soft': 'cubic-bezier(0.22, 1, 0.36, 1)'
      }
    }
  },
  plugins: []
};
