import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { socket } from '../lib/socket';

export function useInventory() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const handleUpdate = () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory() });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard() });
    };

    socket.on('dashboard_update', handleUpdate);

    return () => {
      socket.off('dashboard_update', handleUpdate);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: queryKeys.inventory(),
    queryFn: () => api.get('/api/inventory'),
    staleTime: 10 * 1000,
    refetchInterval: 15 * 1000,
  });
}


export function useCreateInventoryItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => api.post('/api/inventory', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory() });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard() });
    },
  });
}

export function useUpdateInventoryItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...payload }) => api.patch(`/api/inventory/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory() });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard() });
    },
  });
}

export function useDeleteInventoryItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id) => api.del(`/api/inventory/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory() });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard() });
    },
  });
}
