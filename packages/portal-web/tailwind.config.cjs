/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["IBM Plex Sans", "Segoe UI", "sans-serif"],
        mono: ["IBM Plex Mono", "Cascadia Code", "Consolas", "monospace"],
      },
      boxShadow: {
        panel: "0 10px 28px rgba(0, 0, 0, 0.24)",
      },
      screens: {
        compact: "900px",
      },
    },
  },
  plugins: [],
};
