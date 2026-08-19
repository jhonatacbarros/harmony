/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0d0e11',
        surface: {
          50: '#2c2e35',
          100: '#22242a',
          200: '#1a1b20',
          300: '#131418',
          400: '#0e0f13',
        },
        zinc: {
          750: '#202227',
          850: '#16171b',
          950: '#0c0d10',
        },
        accent: {
          white: '#ffffff',
          silver: '#e4e4e7',
          gray: '#71717a',
          emerald: '#10b981',
          rose: '#f43f5e',
          amber: '#f59e0b',
        }
      },
      boxShadow: {
        'glow-white': '0 0 25px -5px rgba(255, 255, 255, 0.15)',
        'glow-emerald': '0 0 25px -5px rgba(16, 185, 129, 0.25)',
        'glow-rose': '0 0 25px -5px rgba(244, 63, 94, 0.25)',
        'glass-card': 'inset 0 1px 0 0 rgba(255, 255, 255, 0.08), 0 10px 30px -10px rgba(0, 0, 0, 0.6)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'equalizer': 'equalizer 1.2s ease-in-out infinite alternate',
      },
      keyframes: {
        equalizer: {
          '0%': { height: '15%' },
          '50%': { height: '85%' },
          '100%': { height: '40%' },
        },
      }
    },
  },
  plugins: [],
}
