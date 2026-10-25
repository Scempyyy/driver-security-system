/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        neuro: {
          bg: '#0b0f19',
          card: '#111827',
          border: '#1f2937',
          accent: '#3b82f6',
          warning: '#f59e0b',
          danger: '#ef4444',
          success: '#10b981',
        }
      }
    },
  },
  plugins: [],
}
