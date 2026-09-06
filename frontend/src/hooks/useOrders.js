import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { socket } from '../lib/socket';

export function useOrders() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const handleUpdate = () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders() });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard() });
    };

    socket.on('dashboard_update', handleUpdate);

    return () => {
      socket.off('dashboard_update', handleUpdate);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: queryKeys.orders(),
    queryFn: () => api.get('/api/orders'),
    staleTime: 10 * 1000,
    refetchInterval: 15 * 1000,
  });
}

export function useOrder(id) {
  return useQuery({
    queryKey: queryKeys.order(id),
    queryFn: () => api.get(`/api/orders/${id}`),
    enabled: !!id,
    staleTime: 60 * 1000,
  });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => api.post('/api/orders', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders() });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard() });
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory() });
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals() });
    },
  });
}
