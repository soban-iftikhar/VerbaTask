import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { socket } from '../lib/socket';

export function useApprovals() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const handleUpdate = () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals() });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard() });
      queryClient.invalidateQueries({ queryKey: queryKeys.orders() });
    };

    socket.on('dashboard_update', handleUpdate);

    return () => {
      socket.off('dashboard_update', handleUpdate);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: queryKeys.approvals(),
    queryFn: () => api.get('/api/approvals'),
    staleTime: 10 * 1000,
    refetchInterval: 15 * 1000,
  });
}

export function useRespondApproval() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, decision }) =>
      api.patch(`/api/approvals/${id}/respond`, { decision }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals() });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard() });
      queryClient.invalidateQueries({ queryKey: queryKeys.orders() });
    },
  });
}
