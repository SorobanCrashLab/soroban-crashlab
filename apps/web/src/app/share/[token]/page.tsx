// WIP scaffold for issue #2274. Not wired to real token validation/redaction yet —
// do not treat this as a secure public endpoint.
export const dynamic = "force-dynamic";

export default async function PublicSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <div className="container-full page-padding fade-in">
      <h1 className="heading-page">Shared view (WIP)</h1>
      <p className="text-meta mt-1">
        Scaffold for issue #2274. Token {token} is not yet validated against any share-link
        store.
      </p>
    </div>
  );
}
