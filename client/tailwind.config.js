/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        mongo: {
          green: '#00ED64',
          dark: '#001E2B',
          light: '#E8EDEB',
          accent: '#00684A',
          slate: '#023430'
        }
      }
    },
  },
  plugins: [],
}
