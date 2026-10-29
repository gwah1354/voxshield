/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: { extend: { colors: { ink: "#0a1020", panel: "#111a2e", line: "#223049", accent: "#38d0f0" } } },
  plugins: [],
};
