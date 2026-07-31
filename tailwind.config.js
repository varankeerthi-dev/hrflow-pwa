/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        geist: ['Geist Variable', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
