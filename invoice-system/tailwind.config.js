/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#1a1a1a",
          100: "#222222",
          200: "#333333",
          300: "#555555",
          400: "#888888",
          500: "#aaaaaa",
          600: "#cccccc",
          700: "#dddddd",
          800: "#eeeeee",
          900: "#f5f5f5",
          950: "#ffffff",
        },
        accent: {
          DEFAULT: "#d97700",
          light: "#f59e0b",
          dark: "#c97000",
        },
        surface: {
          DEFAULT: "#0a0a0a",
          raised: "#111111",
          sunken: "#050505",
        },
      },
      fontFamily: {
        display: ['"DM Serif Display"', "Georgia", "serif"],
        body: ['"DM Sans"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      boxShadow: {
        card: "0 1px 3px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.2)",
        elevated: "0 4px 16px rgba(0, 0, 0, 0.4), 0 1px 4px rgba(0, 0, 0, 0.2)",
        modal: "0 12px 48px rgba(0, 0, 0, 0.5), 0 4px 16px rgba(0, 0, 0, 0.3)",
      },
    },
  },
  plugins: [],
};
