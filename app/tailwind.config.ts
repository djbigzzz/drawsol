import type { Config } from "tailwindcss";

/**
 * "Ticket Office" palette — DESIGN.md §2.9. Closed palette: nothing outside this list.
 * Tailwind is used for layout utilities only; component styling lives in globals.css,
 * in classes named after the printed objects (.ticket, .stub, .stamp, .barcode, .slip…).
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    colors: {
      transparent: "transparent",
      current: "currentColor",
      paper: "#EFE8D9",
      "paper-2": "#E6DDCA",
      stock: "#FBF8F0",
      "stock-2": "#F3EEE2",
      ink: "#1B1814",
      "ink-2": "#4F473C",
      "ink-3": "#625949",
      rule: "rgba(27,24,20,.16)",
      "rule-2": "rgba(27,24,20,.32)",
      red: "#DE3F2B",
      "red-ink": "#A92A1A",
      "red-fill": "#C4321F",
      blue: "#2448B0",
      "blue-ink": "#1F3F9E",
    },
    fontFamily: {
      grot: ['"Archivo Variable"', "Archivo", '"Arial Narrow"', "sans-serif"],
      serif: ['"Newsreader Variable"', "Georgia", "serif"],
    },
    screens: { md: "761px", lg: "1024px", xl: "1336px" },
    extend: { maxWidth: { page: "1440px" } },
  },
  plugins: [],
};

export default config;
