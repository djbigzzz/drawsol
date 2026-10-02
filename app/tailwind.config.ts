import type { Config } from "tailwindcss";

/** "Night Draw" palette — SPEC §4.2. Nothing outside this list. */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    colors: {
      transparent: "transparent",
      current: "currentColor",
      black: "#0B0A09",
      board: "#151311",
      panel: "#1C1A17",
      line: "#2A2622",
      cream: "#F3EAD6",
      dim: "#8A8174",
      brass: "#D4A24C",
      red: "#FF3B2F",
      green: "#4FB286",
    },
    fontFamily: {
      display: ['"Big Shoulders Display"', "Impact", "sans-serif"],
      sans: ['"IBM Plex Sans"', "system-ui", "sans-serif"],
      mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
    },
    extend: {
      screens: { xs: "420px" },
      maxWidth: { page: "1240px" },
    },
  },
  plugins: [],
};

export default config;
