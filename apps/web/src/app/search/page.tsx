'use client';

import dynamic from 'next/dynamic';
import { LoadingSpinner } from '../../components/LoadingSkeleton';

const CreateFuzzySearchPage = dynamic(
  () => import('../../features/misc/create-fuzzy-search-page'),
  { loading: () => <LoadingSpinner /> },
);

export default function SearchRoutePage() {
  return <CreateFuzzySearchPage />;
}
