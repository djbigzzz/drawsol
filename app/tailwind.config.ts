import type { Config } from "tailwindcss";

/**
 * "Clean commercial" palette — docs/DESIGN.md §2. Closed palette: nothing outside this list.
 * Tailwind supplies the preflight reset and layout utilities only; component styling lives in globals.css.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    colors: {
      transparent: "transparent",
      current: "currentColor",
      white: "#FFFFFF",
      navy: "#0B1220",
      "navy-2": "#3B4555",
      "navy-3": "#5F6878",
      surface: "#F5F7FA",
      "surface-2": "#EBEEF3",
      line: "#E3E7EE",
      "line-2": "#CBD2DC",
      accent: "#15803D",
      "accent-2": "#166534",
      "accent-tint": "#F0FDF4",
      "accent-line": "#BBF7D0",
      warn: "#B45309",
      "warn-tint": "#FFFBEB",
      danger: "#B91C1C",
      "danger-tint": "#FEF2F2",
    },
    fontFamily: {
      sans: ['"Plus Jakarta Sans Variable"', '"Plus Jakarta Sans"', "Inter", "system-ui", "sans-serif"],
    },
    screens: { md: "761px", lg: "1024px", xl: "1280px" },
    extend: { maxWidth: { page: "1200px" } },
  },
  plugins: [],
};

export default config;
