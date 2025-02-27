'use client';

import { HydrationBoundary } from '@tanstack/react-query';

export function ClientHydrationBoundary({ children, state }: {
    children: React.ReactNode;
    state?: unknown;
}) {
    return (
        <HydrationBoundary state={state}>
            {children}
        </HydrationBoundary>
    );
}