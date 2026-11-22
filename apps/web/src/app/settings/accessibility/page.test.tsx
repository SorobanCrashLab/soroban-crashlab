import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

jest.mock("../../add-accessible-keyboard-nav-blueprint-page-49", () => ({
  __esModule: true,
  default: () => <div data-testid="accessibility-blueprint" />,
}));

import AccessibilitySettingsPage from "./page";

describe("AccessibilitySettingsPage", () => {
  it("renders the blueprint component", () => {
    render(<AccessibilitySettingsPage />);
    expect(screen.getByTestId("accessibility-blueprint")).toBeInTheDocument();
  });
});
