module.exports = {
  content: [
    "./views/**/*.ejs",
    "./public/js/**/*.js",
    "./lib/package/links.js",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0d1117",
        panel: "#161b22",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
