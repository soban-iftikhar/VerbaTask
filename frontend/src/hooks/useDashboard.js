import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { socket } from '../lib/socket';

export function useDashboard() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const handleUpdate = () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard() });
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory() });
      queryClient.invalidateQueries({ queryKey: queryKeys.orders() });
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals() });
    };

    socket.on('dashboard_update', handleUpdate);

    return () => {
      socket.off('dashboard_update', handleUpdate);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: queryKeys.dashboard(),
    queryFn: () => api.get('/api/dashboard/overview'),
    staleTime: 10 * 1000,
    refetchInterval: 15 * 1000, // 15s gentle polling fallback
  });
}

export function useNotifyExpiries() {
  return useMutation({
    mutationFn: () => api.post('/api/dashboard/notify-expiries'),
  });
}

export function useGenerateReport() {
  return useMutation({
    mutationFn: (reportType) => api.post('/api/reports/whatsapp', { reportType }),
  });
}
