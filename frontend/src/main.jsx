import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { router } from './lib/router';
import './app.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      staleTime: 1000 * 10, // 10 seconds staleTime
      retry: 1,
    },
  },
});

createRoot(document.getElementById('root')).render(
 <StrictMode>
 <QueryClientProvider client={queryClient}>
 <RouterProvider router={router} />
 <Toaster position="top-right" richColors closeButton />
 </QueryClientProvider>
 </StrictMode>
);
