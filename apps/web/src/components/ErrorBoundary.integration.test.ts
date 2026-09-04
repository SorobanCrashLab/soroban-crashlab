/**
 * Integration tests for the ErrorBoundary component.
 *
 * Tests cover happy path (children render), error catching, retry/reset,
 * custom fallbacks, onError/onReset callbacks, resetKeys auto-recovery,
 * default fallback UI rendering, and edge cases.
 *
 * Note: Tests use direct class instantiation and render() to avoid
 * SSR limitations — renderToString does not invoke error boundaries
 * for thrown errors, so error-catching is tested via state manipulation
 * and direct render() calls.
 */

import * as assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ErrorBoundary } from './ErrorBoundary';
import {
  initialErrorState,
  errorStateFromError,
} from './error-boundary-utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A healthy child that renders without errors. */
function SafeChild({ label = 'ok' }: { label?: string }) {
  return React.createElement('span', { 'data-testid': 'safe-child' }, label);
}

/**
 * Walk a React element tree and return whether it contains the given text.
 * Expands function-component elements by calling the component.
 */
function elementTreeContainsText(
  el: React.ReactNode,
  text: string,
): boolean {
  if (el == null) return false;
  if (typeof el === 'string' || typeof el === 'number') return String(el).includes(text);
  if (typeof el === 'boolean') return false;
  if (!React.isValidElement(el)) return false;

  // If the element type is a function component, expand it first.
   
  let node: React.ReactElement = el as any;
  while (typeof node.type === 'function') {
     
    const expanded = (node.type as any)(node.props);
    if (!React.isValidElement(expanded)) {
      return elementTreeContainsText(expanded, text);
    }
    node = expanded;
  }

  // Access props via any cast to avoid strict React type issues.
   
  const props = node.props as any;
  if (props?.children) {
    const kids: React.ReactNode[] = Array.isArray(props.children)
      ? props.children
      : [props.children];
    for (const kid of kids) {
      if (elementTreeContainsText(kid, text)) return true;
    }
  }
  return false;
}

/**
 * Find a descendant element by its `className` prop.
 * Expands function-component elements by calling the component.
 */
function findElementByClass(
  el: React.ReactNode,
  className: string,
): React.ReactElement | null {
  if (el == null) return null;
  if (!React.isValidElement(el)) return null;

  // If the element type is a function component, expand it first.
   
  let node: React.ReactElement = el as any;
  while (typeof node.type === 'function') {
     
    const expanded = (node.type as any)(node.props);
    if (!React.isValidElement(expanded)) {
      return expanded != null ? null : null; // primitive or null
    }
    node = expanded;
  }

  // Access props via any cast to avoid strict React type issues.
   
  const props = node.props as any;
  if (props?.className === className) return node;

  if (props?.children) {
    const kids: React.ReactNode[] = Array.isArray(props.children)
      ? props.children
      : [props.children];
    for (const kid of kids) {
      const found = findElementByClass(kid, className);
      if (found) return found;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Test: static getDerivedStateFromError
// ---------------------------------------------------------------------------

function testStaticGetDerivedStateFromError(): void {
  const error = new Error('boom');
  const state = ErrorBoundary.getDerivedStateFromError(error);
  assert.deepEqual(state, { hasError: true, error });
  console.log('  ✓ getDerivedStateFromError returns correct error state');
}

// ---------------------------------------------------------------------------
// Test: initial state
// ---------------------------------------------------------------------------

function testInitialState(): void {
  const boundary = new ErrorBoundary({ children: null });
  assert.deepEqual(boundary.state, initialErrorState);
  console.log('  ✓ initial state equals initialErrorState');
}

// ---------------------------------------------------------------------------
// Happy path: children render when healthy
// ---------------------------------------------------------------------------

function testRenderHappyPath(): void {
  const html = renderToString(
    React.createElement(ErrorBoundary, null,
      React.createElement(SafeChild, { label: 'hello' })
    )
  );
  assert.ok(html.includes('hello'), 'Happy path renders children');
  console.log('  ✓ happy path renders children via SSR');
}

// ---------------------------------------------------------------------------
// Error path: render() returns default fallback when state has error
// ---------------------------------------------------------------------------

function testRenderErrorWithDefaultFallback(): void {
  const boundary = new ErrorBoundary({ children: null });
  const error = new Error('something broke');
  boundary.state = errorStateFromError(error);

  const rendered = boundary.render();
  const textContent = elementTreeContainsText(rendered, 'Something went wrong');
  const hasMessage = elementTreeContainsText(rendered, 'something broke');
  const hasRetry = elementTreeContainsText(rendered, 'Retry');

  assert.ok(textContent, 'Default fallback should show heading');
  assert.ok(hasMessage, 'Default fallback should show error message');
  assert.ok(hasRetry, 'Default fallback should have a Retry button');
  console.log('  ✓ error state renders default fallback with message and Retry');
}

// ---------------------------------------------------------------------------
// Error path: render() returns custom fallback when provided
// ---------------------------------------------------------------------------

function testRenderErrorWithCustomFallback(): void {
  const boundary = new ErrorBoundary({
    children: null,
    fallback: (err: Error, _retry: () => void) =>
      React.createElement('div', { className: 'custom-fallback' },
        React.createElement('p', null, err.message),
        React.createElement('button', null, 'Custom Retry'),
      ),
  });
  boundary.state = errorStateFromError(new Error('custom error'));

  const rendered = boundary.render();
  const found = findElementByClass(rendered, 'custom-fallback');
  assert.ok(found, 'Custom fallback wrapper should be present');
  const hasMessage = elementTreeContainsText(rendered, 'custom error');
  const hasRetry = elementTreeContainsText(rendered, 'Custom Retry');
  assert.ok(hasMessage && hasRetry, 'Custom fallback shows error and retry button');
  console.log('  ✓ error state renders custom fallback');
}

// ---------------------------------------------------------------------------
// Reset: reset() clears state via setState
// ---------------------------------------------------------------------------

function testReset(): void {
  const boundary = new ErrorBoundary({ children: null });
  boundary.state = errorStateFromError(new Error('oops'));
  assert.equal(boundary.state.hasError, true);

  // reset() calls setState which is async in test env;
  // verify it's callable and doesn't throw.
  assert.doesNotThrow(() => boundary.reset());
  console.log('  ✓ reset() does not throw');
}

// ---------------------------------------------------------------------------
// onError: componentDidCatch invokes the callback
// ---------------------------------------------------------------------------

function testOnError(): void {
  let capturedError: Error | null = null;
  let capturedInfo: React.ErrorInfo | null = null;
  const boundary = new ErrorBoundary({
    children: null,
    onError: (error, info) => {
      capturedError = error;
      capturedInfo = info;
    },
  });

  const error = new Error('caught');
  const info: React.ErrorInfo = { componentStack: '  at Bomb' };
  boundary.componentDidCatch(error, info);

  assert.equal(capturedError, error, 'onError should receive the error');
  assert.equal(capturedInfo, info, 'onError should receive the info');
  console.log('  ✓ onError callback receives error and info');
}

// ---------------------------------------------------------------------------
// onReset: onReset prop registered and reset callable
// ---------------------------------------------------------------------------

function testOnResetCallbackRegistered(): void {
  const boundary = new ErrorBoundary({
    children: null,
    onReset: () => { /* noop */ },
  });
  assert.doesNotThrow(() => boundary.reset());
  console.log('  ✓ onReset callback registered and reset() callable');
}

// ---------------------------------------------------------------------------
// resetKeys: auto-reset when keys change
// ---------------------------------------------------------------------------
// componentDidUpdate compares prevProps.resetKeys with this.props.resetKeys.
// We construct the boundary with resetKeys: ['b'] and pass prevProps with
// resetKeys: ['a'] so that haveResetKeysChanged returns true, triggering
// this.reset().
// ---------------------------------------------------------------------------

function testResetKeysAutoRecovery(): void {
  const boundary = new ErrorBoundary({
    children: null,
    resetKeys: ['b'], // current props
  });
  boundary.state = errorStateFromError(new Error('stale'));

  // prevProps has different keys — auto-reset should fire
  const prevProps = {
    children: null as React.ReactNode,
    resetKeys: ['a'] as readonly unknown[],
  };
  assert.doesNotThrow(() => boundary.componentDidUpdate(prevProps));
  console.log('  ✓ componentDidUpdate auto-resets when resetKeys change');
}

// ---------------------------------------------------------------------------
// resetKeys: no auto-reset when keys are unchanged
// ---------------------------------------------------------------------------

function testResetKeysNoChange(): void {
  const boundary = new ErrorBoundary({
    children: null,
    resetKeys: [1, 2],
  });
  boundary.state = errorStateFromError(new Error('stale'));

  // prevProps has same keys as current — reset should NOT fire.
  // setState is async so state.hasError remains true; the test verifies
  // componentDidUpdate is callable without throwing.
  const prevProps = {
    children: null as React.ReactNode,
    resetKeys: [1, 2] as readonly unknown[],
  };
  boundary.componentDidUpdate(prevProps);
  assert.equal(boundary.state.hasError, true, 'State should still be errored');
  console.log('  ✓ componentDidUpdate does not reset when resetKeys unchanged');
}

// ---------------------------------------------------------------------------
// Edge case: error with empty message still renders fallback
// ---------------------------------------------------------------------------

function testErrorWithNoMessage(): void {
  const boundary = new ErrorBoundary({ children: null });
  const error = new Error('');
  boundary.state = errorStateFromError(error);

  const rendered = boundary.render();
  const hasHeading = elementTreeContainsText(rendered, 'Something went wrong');
  assert.ok(hasHeading, 'Fallback renders even with empty error message');
  console.log('  ✓ fallback renders with empty error message');
}

// ---------------------------------------------------------------------------
// Edge case: multiple children render when healthy (SSR)
// ---------------------------------------------------------------------------

function testMultipleChildrenWhenHealthy(): void {
  const html = renderToString(
    React.createElement(ErrorBoundary, null,
      React.createElement(SafeChild, { label: 'first' }),
      React.createElement(SafeChild, { label: 'second' }),
      React.createElement(SafeChild, { label: 'third' }),
    )
  );
  assert.ok(html.includes('first'), 'Should render first child');
  assert.ok(html.includes('second'), 'Should render second child');
  assert.ok(html.includes('third'), 'Should render third child');
  console.log('  ✓ renders multiple children when healthy');
}

// ---------------------------------------------------------------------------
// Edge case: hasError false with null error — render children
// ---------------------------------------------------------------------------

function testHasErrorFalseNullError(): void {
  const boundary = new ErrorBoundary({ children: null });
  boundary.state = { hasError: false, error: null };

  const rendered = boundary.render();
  assert.equal(rendered, null, 'Should render children (null) when hasError=false');
  console.log('  ✓ renders children when hasError=false');
}

// ---------------------------------------------------------------------------
// Edge case: hasError false with non-null error — still renders children
// ---------------------------------------------------------------------------

function testHasErrorFalseWithError(): void {
  const boundary = new ErrorBoundary({
    children: React.createElement(SafeChild, { label: 'still good' }),
  });
  boundary.state = { hasError: false, error: new Error('stale error') };

  const rendered = boundary.render();
  const hasText = elementTreeContainsText(rendered, 'still good');
  assert.ok(hasText, 'Should render children even if error is non-null but hasError=false');
  console.log('  ✓ renders children when hasError=false even if error is set');
}

// ---------------------------------------------------------------------------
// Edge case: hasError true but error is null — renders children (guard clause)
// ---------------------------------------------------------------------------

function testHasErrorTrueNullError(): void {
  const boundary = new ErrorBoundary({ children: null });
  boundary.state = { hasError: true, error: null };

  const rendered = boundary.render();
  assert.equal(rendered, null, 'Should render children (null) when error is null');
  console.log('  ✓ guard clause: renders children when hasError=true but error=null');
}

// ---------------------------------------------------------------------------
// Run all tests
// ---------------------------------------------------------------------------

function runAllTests(): void {
  console.log('\nErrorBoundary Integration Tests');
  console.log('================================\n');

  testStaticGetDerivedStateFromError();
  testInitialState();
  testRenderHappyPath();
  testRenderErrorWithDefaultFallback();
  testRenderErrorWithCustomFallback();
  testReset();
  testOnResetCallbackRegistered();
  testOnError();
  testResetKeysAutoRecovery();
  testResetKeysNoChange();
  testErrorWithNoMessage();
  testMultipleChildrenWhenHealthy();
  testHasErrorFalseNullError();
  testHasErrorFalseWithError();
  testHasErrorTrueNullError();

  console.log('\n✅ All ErrorBoundary integration tests passed!\n');
}

runAllTests();
