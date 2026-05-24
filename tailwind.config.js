/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"Fira Code"', 'monospace'],
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        ht: {
          bg: '#0a0a0c',
          header: '#141417',
          border: '#2a2a30',
        },
      },
    },
  },
  plugins: [],
}
