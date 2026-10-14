import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Ryde pink palette (from approved branding). Do NOT modify.
        rydePink: {
          DEFAULT: "#FF3D6E",
          50: "#FFE5EC",
          100: "#FFCEDB",
          500: "#FF3D6E",
          600: "#E62D5C",
          700: "#C7214D",
        },
        ink: {
          DEFAULT: "#0E1726",
          soft: "#3D4A5C",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "Segoe UI", "Helvetica", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;