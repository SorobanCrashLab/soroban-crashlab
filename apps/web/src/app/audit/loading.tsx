import { GenericPageSkeleton } from '@/components/LoadingSkeleton';

/** Route loading state (#1879): a real skeleton, never a fake success. */
export default function Loading() {
  return <GenericPageSkeleton />;
}
