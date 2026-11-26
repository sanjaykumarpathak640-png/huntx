import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#03060d",
          900: "#060b16",
          850: "#0a1120",
          800: "#0d1628",
          700: "#14203a",
          600: "#1d2c4d",
        },
        neon: { DEFAULT: "#39ff88", dim: "#22c96a", glow: "#7dffb2" },
        cyan: { DEFAULT: "#22d3ee", soft: "#67e8f9" },
        amber: { DEFAULT: "#fbbf24" },
        danger: { DEFAULT: "#ff4d6d" },
      },
      fontFamily: {
        display: ['"Space Grotesk"', "system-ui", "sans-serif"],
        sans: ['"Manrope"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      boxShadow: {
        neon: "0 0 0 1px rgba(57,255,136,.35), 0 0 24px -4px rgba(57,255,136,.45)",
        cyan: "0 0 0 1px rgba(34,211,238,.35), 0 0 24px -4px rgba(34,211,238,.45)",
      },
      keyframes: {
        sweep: { to: { transform: "rotate(360deg)" } },
        drift: { "0%": { transform: "translateY(0)" }, "100%": { transform: "translateY(-50%)" } },
        pulseRing: {
          "0%": { transform: "scale(.6)", opacity: ".9" },
          "100%": { transform: "scale(2.4)", opacity: "0" },
        },
        rise: { "0%": { opacity: "0", transform: "translateY(12px)" }, "100%": { opacity: "1", transform: "none" } },
        dash: { to: { strokeDashoffset: "0" } },
        ticker: { to: { transform: "translateX(-50%)" } },
        confetti: {
          "0%": { transform: "translateY(-10vh) rotate(0)", opacity: "1" },
          "100%": { transform: "translateY(110vh) rotate(720deg)", opacity: "0.6" },
        },
      },
      animation: {
        sweep: "sweep 6s linear infinite",
        drift: "drift 40s linear infinite",
        pulseRing: "pulseRing 2.4s ease-out infinite",
        rise: "rise .5s ease-out both",
        dash: "dash 2.5s ease-out forwards",
        ticker: "ticker 45s linear infinite",
      },
    },
  },
  plugins: [],
};
export default config;
