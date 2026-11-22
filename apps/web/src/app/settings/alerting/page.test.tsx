import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

jest.mock("../../create-alerting-settings-page-page", () => ({
  __esModule: true,
  default: () => <div data-testid="alerting-settings-page" />,
}));

import AlertingSettingsRoutePage from "./page";

describe("AlertingSettingsRoutePage", () => {
  it("renders the alerting settings component", () => {
    render(<AlertingSettingsRoutePage />);
    expect(screen.getByTestId("alerting-settings-page")).toBeInTheDocument();
  });
});
