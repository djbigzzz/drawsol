import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#09090B",
        surface: "#131316",
        elevated: "#1C1C21",
        hover: "#232329",
        primary: "#E8762D",
        success: "#2FB88A",
        text: "#EDEDEF",
        secondary: "#8B8B93",
        tertiary: "#5A5A63",
      },
      fontFamily: {
        display: ["Clash Display", "system-ui", "sans-serif"],
        sans: ["Satoshi", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      borderRadius: {
        btn: "10px",
        card: "16px",
        modal: "20px",
      },
    },
  },
  plugins: [],
};

export default config;
