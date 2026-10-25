// Farben und Schrift wie in der mailcow-Oberfläche (014-mailcow.css, mailcow-darkmode.css)
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  // dynamisch zusammengesetzte Klassen (alert-${typ})
  safelist: ["alert-success", "alert-warning", "alert-danger", "alert-info"],
  darkMode: "media",
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Noto Sans"', '"Helvetica Neue"', "Helvetica", "Arial", "sans-serif"],
        mono: ["Consolas", "Monaco", '"Liberation Mono"', '"Courier New"', "monospace"],
      },
      colors: {
        mc: {
          primary: "#0F688D", "primary-border": "#0d526d", info: "#148DBC", "info-border": "#127ea8",
          bg: "#fbfbfb", surface: "#ffffff", alt: "#f7f7f7", border: "#dfdfdf", muted: "#959595",
          success: "#28b62c", danger: "#ff4136", warning: "#ff851b", cow: "#F5D76E", text: "#222222",
          "d-bg": "#1c1c1e", "d-surface": "#2c2c2e", "d-alt": "#282828", "d-border": "#555555",
          "d-text": "#f2f2f7", "d-soft": "#cccccc", "d-input": "#424242", "d-link": "#6fc7e9",
        },
      },
      fontSize: { base: ["14px", "1.45"] },
    },
  },
  plugins: [],
};
