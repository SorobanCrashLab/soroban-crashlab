/** @type {import('tailwindcss').Config} */
module.exports = {
  // Use class strategy so toggling the `dark` class controls dark mode
  darkMode: "class",
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}",
    "./src/pages/**/*.{js,ts,jsx,tsx}",
  ],
  // Tailwind v4 color, type, spacing, elevation, and z-index utilities are
  // mapped through @theme in src/styles/tokens and src/styles/typography.css.
  theme: {
    extend: {},
  },
  plugins: [],
};
