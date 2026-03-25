/**
 * SemanticCacheView — Lazy-loading wrapper for the Semantic Cache dashboard.
 *
 * M1-02: Code-splits the heavy Qdrant/cache content (useSemanticCache hooks,
 * stat cards, config panel, entry list) into a separate chunk loaded on demand
 * via React.lazy(). Shows a ViewSkeleton immediately while the content loads.
 */

import { lazy, Suspense } from 'react';
import { ViewSkeleton } from '@/components/molecules/ViewSkeleton';

const SemanticCacheViewContent = lazy(() => import('./SemanticCacheViewContent'));

export function SemanticCacheView() {
  return (
    <Suspense fallback={<ViewSkeleton />}>
      <SemanticCacheViewContent />
    </Suspense>
  );
}

export default SemanticCacheView;
