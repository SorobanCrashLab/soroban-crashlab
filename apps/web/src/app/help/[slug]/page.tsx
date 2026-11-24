// WIP scaffold for issue #2281. Not wired to real article content yet.
export const dynamic = "force-dynamic";

export default async function HelpArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <div className="container-full page-padding fade-in">
      <h1 className="heading-page">Help article: {slug} (WIP)</h1>
    </div>
  );
}
