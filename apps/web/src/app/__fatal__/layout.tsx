export default function FatalLayout({ children }: { children: React.ReactNode }) {
  throw new Error('Global error boundary smoke test: fatal layout failure');

  return <>{children}</>;
}
