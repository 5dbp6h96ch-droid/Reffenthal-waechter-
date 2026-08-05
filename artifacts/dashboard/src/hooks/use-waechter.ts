import {
  useGetWaechterState,
  getGetWaechterStateQueryKey,
  useGetWaechterTreffer,
  getGetWaechterTrefferQueryKey,
} from '@workspace/api-client-react';

const REFRESH_INTERVAL_MS = 2 * 60 * 1000;

export function useWaechterState() {
  return useGetWaechterState({
    query: {
      queryKey: getGetWaechterStateQueryKey(),
      refetchInterval: REFRESH_INTERVAL_MS,
    },
  });
}

export function useWaechterTreffer() {
  return useGetWaechterTreffer({
    query: {
      queryKey: getGetWaechterTrefferQueryKey(),
      refetchInterval: REFRESH_INTERVAL_MS,
    },
  });
}
