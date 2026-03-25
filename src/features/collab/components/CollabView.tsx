/**
 * CollabView — Lazy-loading wrapper for CRDT Collaboration dashboard.
 *
 * M1-02: Code-splits the heavy Yjs/CRDT content (useCollabDocument, CollabCursors,
 * y-websocket) into a separate chunk loaded on demand via React.lazy().
 * The thin wrapper shows a loading skeleton immediately while the heavy
 * CollabViewContent chunk is fetched.
 */

import { lazy, Suspense } from 'react';
import { ViewSkeleton } from '@/components/molecules/ViewSkeleton';

const CollabViewContent = lazy(() => import('./CollabViewContent'));

export function CollabView() {
  return (
    <Suspense fallback={<ViewSkeleton />}>
      <CollabViewContent />
    </Suspense>
  );
}
