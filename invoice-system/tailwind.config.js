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
          50: "#f7f7f5",
          100: "#edecea",
          200: "#dbd9d3",
          300: "#c2bfb6",
          400: "#a8a396",
          500: "#928c7d",
          600: "#807a6c",
          700: "#6a655a",
          800: "#58544c",
          900: "#4a4742",
          950: "#1a1916",
        },
        accent: {
          DEFAULT: "#c45d3e",
          light: "#d4795e",
          dark: "#a34a2f",
        },
        surface: {
          DEFAULT: "#faf9f7",
          raised: "#ffffff",
          sunken: "#f0efec",
        },
      },
      fontFamily: {
        display: ['"DM Serif Display"', "Georgia", "serif"],
        body: ['"DM Sans"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      boxShadow: {
        card: "0 1px 3px rgba(26, 25, 22, 0.06), 0 1px 2px rgba(26, 25, 22, 0.04)",
        elevated: "0 4px 16px rgba(26, 25, 22, 0.08), 0 1px 4px rgba(26, 25, 22, 0.04)",
        modal: "0 12px 48px rgba(26, 25, 22, 0.12), 0 4px 16px rgba(26, 25, 22, 0.06)",
      },
    },
  },
  plugins: [],
};
