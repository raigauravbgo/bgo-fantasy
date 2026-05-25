import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/app/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Plus Jakarta Sans", "system-ui", "sans-serif"],
        mono: ["DM Mono", "monospace"],
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "1rem" }],
      },
      colors: {
        // BGO brand palette — all derived from CSS variables
        brand: {
          DEFAULT: "hsl(var(--brand))",
          hover: "hsl(var(--brand-hover))",
          muted: "hsl(var(--brand-muted))",
          fg: "hsl(var(--brand-fg))",
        },
        accent2: {
          DEFAULT: "hsl(var(--accent2))",
          fg: "hsl(var(--accent2-fg))",
        },
        // Surfaces — 4-layer depth model
        surface: {
          base: "hsl(var(--surface-base))",
          raised: "hsl(var(--surface-raised))",
          overlay: "hsl(var(--surface-overlay))",
          sunken: "hsl(var(--surface-sunken))",
        },
        // Text hierarchy
        ink: {
          DEFAULT: "hsl(var(--ink))",
          secondary: "hsl(var(--ink-secondary))",
          muted: "hsl(var(--ink-muted))",
        },
        line: "hsl(var(--line))",
        // Semantic
        danger: {
          DEFAULT: "hsl(var(--danger))",
          bg: "hsl(var(--danger-bg))",
        },
        warn: {
          DEFAULT: "hsl(var(--warn))",
          bg: "hsl(var(--warn-bg))",
        },
        ok: {
          DEFAULT: "hsl(var(--ok))",
          bg: "hsl(var(--ok-bg))",
        },
        live: {
          DEFAULT: "hsl(var(--live))",
          bg: "hsl(var(--live-bg))",
        },
        // Position colours
        pos: {
          gk: "hsl(var(--pos-gk))",
          "gk-bg": "hsl(var(--pos-gk-bg))",
          def: "hsl(var(--pos-def))",
          "def-bg": "hsl(var(--pos-def-bg))",
          mid: "hsl(var(--pos-mid))",
          "mid-bg": "hsl(var(--pos-mid-bg))",
          fwd: "hsl(var(--pos-fwd))",
          "fwd-bg": "hsl(var(--pos-fwd-bg))",
        },
        // shadcn compatibility aliases
        background: "hsl(var(--surface-base))",
        foreground: "hsl(var(--ink))",
        primary: {
          DEFAULT: "hsl(var(--brand))",
          foreground: "hsl(var(--brand-fg))",
        },
        secondary: {
          DEFAULT: "hsl(var(--surface-overlay))",
          foreground: "hsl(var(--ink-secondary))",
        },
        muted: {
          DEFAULT: "hsl(var(--surface-raised))",
          foreground: "hsl(var(--ink-muted))",
        },
        destructive: {
          DEFAULT: "hsl(var(--danger))",
          foreground: "hsl(var(--brand-fg))",
        },
        border: "hsl(var(--line))",
        input: "hsl(var(--surface-sunken))",
        ring: "hsl(var(--brand))",
        card: {
          DEFAULT: "hsl(var(--surface-raised))",
          foreground: "hsl(var(--ink))",
        },
        popover: {
          DEFAULT: "hsl(var(--surface-overlay))",
          foreground: "hsl(var(--ink))",
        },
      },
      borderRadius: {
        xs: "0.1875rem",   // 3px — badges
        sm: "0.3125rem",   // 5px — tags, small chips
        DEFAULT: "0.5rem", // 8px — inputs, buttons
        md: "0.625rem",    // 10px
        lg: "0.875rem",    // 14px — cards
        xl: "1.125rem",    // 18px — modals, hero cards
        "2xl": "1.5rem",   // 24px — large panels
        full: "9999px",    // pills, avatars
      },
      boxShadow: {
        card: "0 1px 0 0 hsl(var(--surface-overlay)) inset, 0 0 0 1px hsl(var(--line)), 0 4px 16px -2px hsl(220 40% 3% / 0.55)",
        "card-hover": "0 1px 0 0 hsl(var(--surface-overlay)) inset, 0 0 0 1px hsl(var(--brand) / 0.5), 0 8px 32px -4px hsl(220 40% 3% / 0.7)",
        "card-active": "0 0 0 2px hsl(var(--brand))",
        float: "0 8px 40px -8px hsl(220 40% 3% / 0.8), 0 0 0 1px hsl(var(--line))",
        glow: "0 0 20px hsl(var(--brand) / 0.35)",
        "glow-live": "0 0 16px hsl(var(--live) / 0.4)",
        inset: "0 2px 8px hsl(220 40% 3% / 0.4) inset",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(16px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        pulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
        "score-pop": {
          "0%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.18)" },
          "100%": { transform: "scale(1)" },
        },
      },
      animation: {
        "fade-in": "fade-in 200ms cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-in-right": "slide-in-right 200ms cubic-bezier(0.16, 1, 0.3, 1)",
        shimmer: "shimmer 2s linear infinite",
        "pulse-slow": "pulse 2.5s ease-in-out infinite",
        "score-pop": "score-pop 300ms cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
      transitionTimingFunction: {
        spring: "cubic-bezier(0.16, 1, 0.3, 1)",
        "out-expo": "cubic-bezier(0.19, 1, 0.22, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
