/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        // Verde-azulado da Casa de Saúde São Lucas (tirado da logo; 600 = cor principal #007070)
        marca: {
          50: '#eaf6f5',
          100: '#cdeceb',
          200: '#9fd8d4',
          300: '#6cc1bb',
          400: '#2fa39c',
          500: '#0b8781',
          600: '#007070',
          700: '#005a5c',
          800: '#004548',
          900: '#003234',
        },
      },
    },
  },
  plugins: [],
};
