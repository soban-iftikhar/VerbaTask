import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { socket } from '../lib/socket';

export function useWorkflows() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const handleUpdate = () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows() });
    };

    socket.on('dashboard_update', handleUpdate);

    return () => {
      socket.off('dashboard_update', handleUpdate);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: queryKeys.workflows(),
    queryFn: () => api.get('/api/workflows'),
    staleTime: 10 * 1000,
  });
}

export function useCreateWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => api.post('/api/workflows', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows() });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard() });
    },
  });
}

export function useUpdateWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...payload }) => api.patch(`/api/workflows/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows() });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard() });
    },
  });
}

export function useDeleteWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id) => api.del(`/api/workflows/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows() });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard() });
    },
  });
}
