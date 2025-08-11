/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        gold: "#e3c26b",
        indigoDeep: "#0b1020",
        panel: "#111837",
      },
      boxShadow: {
        glow: "0 0 20px rgba(227,194,107,0.3)",
      },
    },
  },
  plugins: [],
};
