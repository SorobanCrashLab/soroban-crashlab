import AuditExplorer from './AuditExplorer';

export default function AuditPage() {
  return (
    <div className="container-full page-padding fade-in">
      <div className="mb-4 sm:mb-6">
        <h1 className="heading-page">Audit trail</h1>
        <p className="text-meta mt-0.5 sm:mt-1">
          Server-side, tamper-evident record of actions in your organisation — query, inspect and export
        </p>
      </div>
      <AuditExplorer />
    </div>
  );
}
