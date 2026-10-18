/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        studio: {
          0: '#0a0a0b',
          1: '#131316',
          2: '#1c1c21',
          3: '#26262d',
          border: '#2e2e36',
          accent: '#f59e0b',
          cyan: '#06b6d4',
          green: '#10b981',
          red: '#ef4444',
        },
      },
    },
  },
  plugins: [],
};
