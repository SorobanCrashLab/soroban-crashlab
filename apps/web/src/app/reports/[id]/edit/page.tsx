import type { Metadata } from 'next';
import { TechnicalReportEditor } from '@/features/reports/editor/TechnicalReportEditor';

export const metadata: Metadata = {
  title: 'Edit technical report · Soroban CrashLab',
  description: 'Markdown-first incident report and triage writeup editor.',
};

export default async function ReportEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6 md:px-8">
      <TechnicalReportEditor reportId={id} />
    </main>
  );
}
