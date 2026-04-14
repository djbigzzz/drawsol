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
        bg: "#05080F",
        primary: "#F7931A",
        accent: "#00C896",
        text: "#EDE9E3",
      },
      fontFamily: {
        heading: ["Playfair Display", "serif"],
        mono: ["Space Mono", "monospace"],
        body: ["Manrope", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
