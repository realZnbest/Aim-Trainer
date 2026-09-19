/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Night-range grounds (blue-black, never neutral gray)
        abyss: '#04070e',
        deep: '#070c17',
        panel: '#0a1120',
        raised: '#0e1628',
        // Hairlines carry a blue tint so dividers read as steel, not gray
        line: '#22304e',
        linesoft: '#141e36',
        // Ink scale tinted from the blue ground
        ink: '#e9effc',
        mist: '#93a3c4',
        faint: '#5d6d92',
        // Brand pink — the single action color. No glow, never gradient text.
        brand: {
          DEFAULT: '#e7548f',
          strong: '#f06ba1',
          soft: '#f4a3c3',
          ink: '#1c0712',
        },
        // Steel blue — information, secondary highlights, range markings
        steel: {
          DEFAULT: '#6ea8ff',
          deep: '#3b5fa0',
          ink: '#06101f',
        },
        danger: '#e56a80',
        success: '#5fce8f',
        warn: '#e0b25f',
      },
      fontFamily: {
        display: ['"Chakra Petch"', '"Noto Sans Thai"', 'system-ui', 'sans-serif'],
        sans: ['system-ui', '-apple-system', '"Segoe UI"', '"Noto Sans Thai"', 'sans-serif'],
        mono: ['ui-monospace', '"SF Mono"', '"Cascadia Mono"', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: {
        card: '14px',
      },
    },
  },
  plugins: [],
};
