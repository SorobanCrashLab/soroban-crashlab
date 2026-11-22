// WIP scaffold for issue #2274. No CSP/sandbox hardening or real embed rendering yet.
export const dynamic = "force-dynamic";

export default async function EmbeddedSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <div className="page-padding">
      <p>Embed scaffold for issue #2274. Token {token} is not yet validated.</p>
    </div>
  );
}
