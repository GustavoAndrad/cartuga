/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cartuga: {
          50: "#eef5ef",
          100: "#d3e6d6",
          200: "#a7ceac",
          300: "#78b380",
          400: "#4f9459",
          500: "#357740",
          600: "#265c30",
          700: "#1d4726",
          800: "#17371e",
          900: "#122c18",
        },
      },
    },
  },
  plugins: [],
};
