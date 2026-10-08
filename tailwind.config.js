/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        marca: { 50: '#eef6ff', 100: '#d9eaff', 500: '#1d6fd8', 600: '#155bb5', 700: '#124a91' },
      },
    },
  },
  plugins: [],
};
