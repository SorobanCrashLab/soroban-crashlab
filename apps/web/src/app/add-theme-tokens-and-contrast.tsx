"use client";

import React, { useEffect, useMemo, useState } from "react";

type Mode = "light" | "dark";

const TOKENS: Record<Mode, Record<string, string>> = {
  light: {
    "--color-bg": "#f8fafc",
    "--color-surface": "#ffffff",
    "--color-primary": "#0f172a",
    "--color-accent": "#06b6d4",
    "--color-muted": "#6b7280",
    "--color-border": "#e6e7e9",
    "--color-elevated": "#ffffff",
    "--color-text": "#0f172a",
  },
  dark: {
    "--color-bg": "#0b1220",
    "--color-surface": "#071024",
    "--color-primary": "#e6eef6",
    "--color-accent": "#2dd4bf",
    "--color-muted": "#9ca3af",
    "--color-border": "rgba(255,255,255,0.06)",
    "--color-elevated": "#0b1228",
    "--color-text": "#e6eef6",
  },
};

const HIGH_CONTRAST_OVERRIDES: Record<Mode, Record<string, string>> = {
  light: {
    "--color-accent": "#0ea5a4",
    "--color-muted": "#4b5563",
    "--color-border": "#cfd8e3",
  },
  dark: {
    "--color-accent": "#14b8a6",
    "--color-muted": "#9aa6b2",
    "--color-border": "rgba(255,255,255,0.12)",
  },
};

function hexToRgb(hex: string) {
  const h = hex.replace("#", "").trim();
  if (h.startsWith("rgba") || h.startsWith("rgb")) {
    const nums = h
      .replace(/[rgba()]/g, "")
      .split(",")
      .map((s) => Number(s));
    return { r: nums[0], g: nums[1], b: nums[2] };
  }
  const bigint = parseInt(
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h,
    16,
  );
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return { r, g, b };
}

function srgbToLinear(u: number) {
  const s = u / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hexOrRgb: string) {
  try {
    // Accept CSS color like rgba(...) or hex
    let rgb = { r: 0, g: 0, b: 0 };
    if (hexOrRgb.startsWith("rgb")) {
      const nums = hexOrRgb
        .replace(/rgba?\(|\)/g, "")
        .split(",")
        .map((s) => Number(s));
      rgb = { r: nums[0], g: nums[1], b: nums[2] };
    } else {
      rgb = hexToRgb(hexOrRgb);
    }
    const R = srgbToLinear(rgb.r);
    const G = srgbToLinear(rgb.g);
    const B = srgbToLinear(rgb.b);
    return 0.2126 * R + 0.7152 * G + 0.0722 * B;
  } catch {
    return 0;
  }
}

function contrastRatio(a: string, b: string) {
  const L1 = relativeLuminance(a);
  const L2 = relativeLuminance(b);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  const ratio = (lighter + 0.05) / (darker + 0.05);
  return Math.round(ratio * 100) / 100;
}

export default function ThemeTokensAndContrastDemo() {
  const [mode, setMode] = useState<Mode>("light");
  const [highContrast, setHighContrast] = useState(false);

  // Apply tokens to document root so the rest of the app can use them
  useEffect(() => {
    const base = TOKENS[mode];
    Object.keys(base).forEach((k) => {
      document.documentElement.style.setProperty(k, base[k]);
    });
    if (highContrast) {
      const overrides = HIGH_CONTRAST_OVERRIDES[mode];
      Object.keys(overrides).forEach((k) => {
        document.documentElement.style.setProperty(k, overrides[k]);
      });
      document.documentElement.setAttribute("data-contrast", "high");
    } else {
      // remove overrides by re-applying base for those keys
      Object.keys(HIGH_CONTRAST_OVERRIDES[mode]).forEach((k) => {
        const baseVal = base[k] ?? base["--color-accent"];
        document.documentElement.style.setProperty(k, baseVal);
      });
      document.documentElement.setAttribute("data-contrast", "normal");
    }
    // also toggle `.dark` class for tailwind/dark-mode compatibility
    if (mode === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [mode, highContrast]);

  const tokenEntries = useMemo(() => {
    return Object.entries(TOKENS[mode]).map(([k, v]) => {
      // if highContrast override exists and is active, prefer that value
      const override = highContrast
        ? HIGH_CONTRAST_OVERRIDES[mode][k]
        : undefined;
      const val = override ?? v;
      return { name: k, value: val };
    });
  }, [mode, highContrast]);

  const bg =
    getComputedStyle(document.documentElement).getPropertyValue("--color-bg") ||
    (mode === "dark" ? "#071024" : "#f8fafc");

  return (
    <div className="min-h-screen p-6" style={{ background: "var(--color-bg)" }}>
      <div className="max-w-5xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <h1
            className="text-2xl font-semibold"
            style={{ color: "var(--color-text)" }}
          >
            Theme tokens & contrast demo
          </h1>
          <div className="flex items-center gap-3">
            <div
              className="flex items-center gap-3 px-3 py-2 rounded-lg border"
              style={{
                borderColor: "var(--color-border)",
                background: "var(--color-elevated)",
              }}
            >
              <label className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-300">
                Mode
              </label>
              <select
                aria-label="Theme mode"
                value={mode}
                onChange={(e) => setMode(e.target.value as Mode)}
                className="bg-transparent text-sm px-2 py-1 border rounded"
                style={{
                  borderColor: "var(--color-border)",
                  color: "var(--color-text)",
                }}
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>

            <div
              className="flex items-center gap-3 px-3 py-2 rounded-lg border"
              style={{
                borderColor: "var(--color-border)",
                background: "var(--color-elevated)",
              }}
            >
              <label className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-300">
                Contrast
              </label>
              <button
                type="button"
                onClick={() => setHighContrast((s) => !s)}
                className={`inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
                  highContrast ? "bg-blue-600" : "bg-zinc-300 dark:bg-zinc-600"
                }`}
                aria-pressed={highContrast}
                aria-label="Toggle high contrast"
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${highContrast ? "translate-x-6" : "translate-x-1"}`}
                ></span>
              </button>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="col-span-2">
            <div
              className="rounded-lg shadow-sm p-4"
              style={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
              }}
            >
              <h2
                className="text-lg font-medium mb-2"
                style={{ color: "var(--color-text)" }}
              >
                Dashboard sample
              </h2>
              <p
                className="text-sm mb-4"
                style={{ color: "var(--color-muted)" }}
              >
                This small panel demonstrates the theme tokens applied as CSS
                variables. Toggle theme and contrast to see tokens update.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div
                  className="p-3 rounded"
                  style={{
                    background: "var(--color-elevated)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  <div
                    className="text-sm font-semibold mb-1"
                    style={{ color: "var(--color-primary)" }}
                  >
                    Primary
                  </div>
                  <div
                    className="text-xs"
                    style={{ color: "var(--color-muted)" }}
                  >
                    Use for headings, important labels
                  </div>
                </div>

                <div
                  className="p-3 rounded"
                  style={{
                    background: "var(--color-elevated)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  <div
                    className="text-sm font-semibold mb-1"
                    style={{ color: "var(--color-accent)" }}
                  >
                    Accent
                  </div>
                  <div
                    className="text-xs"
                    style={{ color: "var(--color-muted)" }}
                  >
                    Use for interactive elements and highlights
                  </div>
                </div>

                <div
                  className="p-3 rounded"
                  style={{
                    background: "var(--color-elevated)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  <div
                    className="text-sm font-semibold mb-1"
                    style={{ color: "var(--color-text)" }}
                  >
                    Surface
                  </div>
                  <div
                    className="text-xs"
                    style={{ color: "var(--color-muted)" }}
                  >
                    Cards and panels
                  </div>
                </div>

                <div
                  className="p-3 rounded"
                  style={{
                    background: "var(--color-elevated)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  <div
                    className="text-sm font-semibold mb-1"
                    style={{ color: "var(--color-border)" }}
                  >
                    Border
                  </div>
                  <div
                    className="text-xs"
                    style={{ color: "var(--color-muted)" }}
                  >
                    Dividers, outlines
                  </div>
                </div>
              </div>
            </div>
          </div>

          <aside>
            <div
              className="rounded-lg shadow-sm p-4"
              style={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
              }}
            >
              <h3
                className="text-md font-medium mb-3"
                style={{ color: "var(--color-text)" }}
              >
                Tokens
              </h3>
              <div className="space-y-3">
                {tokenEntries.map((t) => {
                  const cssVar = `var(${t.name})`;
                  const value = t.value;
                  const ratio = contrastRatio(value, bg || "#ffffff");
                  return (
                    <div
                      key={t.name}
                      className="flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded border"
                          style={{
                            background: value,
                            borderColor: "var(--color-border)",
                          }}
                        />
                        <div>
                          <div
                            className="text-sm font-medium"
                            style={{ color: "var(--color-text)" }}
                          >
                            {t.name}
                          </div>
                          <div className="text-xs text-zinc-500 dark:text-zinc-400">
                            {value}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div
                          className="text-sm font-mono"
                          style={{ color: "var(--color-text)" }}
                        >
                          {cssVar}
                        </div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400">
                          contrast vs bg: {ratio}:1
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
                Note: WCAG AA recommends 4.5:1 for normal text and 3:1 for large
                text. Ratios shown are computed against the page background
                token.
              </div>
            </div>
          </aside>
        </section>

        <footer className="mt-6 text-sm text-zinc-500 dark:text-zinc-400">
          This page is a demo for theme tokens and contrast. It sets CSS
          variables on <code>document.documentElement</code> so other components
          can read <code>var(--color-*)</code>.
        </footer>
      </div>
    </div>
  );
}
