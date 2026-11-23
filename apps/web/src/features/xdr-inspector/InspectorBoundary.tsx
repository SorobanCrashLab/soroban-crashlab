'use client';
import { Component, type ReactNode } from 'react';
export default class InspectorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div role="alert" className="rounded border border-red-500 p-4">
        The inspector could not render this payload.{' '}
        <button
          type="button"
          className="underline"
          onClick={() => this.setState({ failed: false })}
        >
          Reset inspector
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
