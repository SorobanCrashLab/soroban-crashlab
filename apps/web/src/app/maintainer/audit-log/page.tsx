import AuditLogViewer from './AuditLogViewer';

export default function AuditLogPage() {
  return (
    <div className="container-full page-padding fade-in">
      <div className="mb-4 sm:mb-6">
        <h1 className="heading-page">Audit log</h1>
        <p className="text-meta mt-0.5 sm:mt-1">
          Append-only record of sensitive maintainer actions, chained by hash
        </p>
      </div>
      <AuditLogViewer />
    </div>
  );
}
