/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary - Navy
        'navy': '#1B2A41',
        'navy-dark': '#0F1824',
        'navy-light': '#2B3E5C',
        
        // Accent - Coral
        'coral': '#FF6B6B',
        'coral-dark': '#E55555',
        'coral-light': '#FF8787',
        
        // Neutral - Cream
        'cream': '#FFF8F3',
        'cream-dark': '#F5E6D3',
        'cream-light': '#FFFDF9',
      },
      fontFamily: {
        'sans': ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

