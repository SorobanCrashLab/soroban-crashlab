import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CrashTrendChart } from "./CrashTrendChart";
import { AnomalySensitivityToggle } from "./AnomalySensitivityToggle";
import { buildDailyRateSeries, detectAnomalies } from "../utils/trendAnomaly";
import { CrashTrendPoint } from "../types";

/** 20 quiet days of 4 crashes with a single 90-crash spike on day 19. */
function spikyData(): CrashTrendPoint[] {
  return Array.from({ length: 20 }, (_, i) => ({
    date: `2026-01-${String(i + 1).padStart(2, "0")}`,
    sigA: i === 18 ? 90 : 4,
  }));
}

describe("CrashTrendChart anomaly layer", () => {
  it("renders the marker layer and legend for flagged days", () => {
    const data = spikyData();
    const { flags } = detectAnomalies(buildDailyRateSeries(data, ["sigA"]));
    expect(flags).toHaveLength(1);

    const html = renderToStaticMarkup(
      <CrashTrendChart
        data={data}
        selectedSignatures={["sigA"]}
        anomalyFlags={flags}
      />,
    );

    // Legend entry documents the active k and window.
    expect(html).toContain("Anomaly");
    expect(html).toContain("3.5×");
    expect(html).toContain("14-day baseline");
  });

  it("omits the anomaly legend when nothing is flagged", () => {
    const data = spikyData().map((p) => ({ ...p, sigA: 4 }));
    const { flags } = detectAnomalies(buildDailyRateSeries(data, ["sigA"]));
    expect(flags).toEqual([]);

    const html = renderToStaticMarkup(
      <CrashTrendChart
        data={data}
        selectedSignatures={["sigA"]}
        anomalyFlags={flags}
      />,
    );
    expect(html).not.toContain("Anomaly —");
  });

  it("renders without an anomalyFlags prop (backwards compatible)", () => {
    const html = renderToStaticMarkup(
      <CrashTrendChart data={spikyData()} selectedSignatures={["sigA"]} />,
    );
    expect(html.length).toBeGreaterThan(50);
  });
});

describe("AnomalySensitivityToggle", () => {
  it("exposes all three presets with their documented k values", () => {
    const html = renderToStaticMarkup(
      <AnomalySensitivityToggle
        value="medium"
        onChange={() => {}}
        flagCount={2}
      />,
    );
    expect(html).toContain("k=4");
    expect(html).toContain("k=3.5");
    expect(html).toContain("k=3");
    expect(html).toContain("2 days flagged");
    expect(html).toContain('role="radiogroup"');
  });

  it("reports the quiet state when nothing is flagged", () => {
    const html = renderToStaticMarkup(
      <AnomalySensitivityToggle
        value="low"
        onChange={() => {}}
        flagCount={0}
      />,
    );
    expect(html).toContain("No days exceed the current threshold.");
  });
});
