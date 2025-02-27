import { cache } from 'react';
import { makeQueryClient } from './query-client';

export const getServerCachedQueryClient = cache(() => makeQueryClient());
