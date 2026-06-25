import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

jest.mock("../../notification-preferences", () => ({
  __esModule: true,
  default: () => <div data-testid="notification-preferences-page" />,
}));

import NotificationSettingsRoute from "./page";

describe("NotificationSettingsRoute", () => {
  it("renders the notification preferences component", () => {
    render(<NotificationSettingsRoute />);
    expect(screen.getByTestId("notification-preferences-page")).toBeInTheDocument();
  });
});
