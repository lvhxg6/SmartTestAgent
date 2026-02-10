/**
 * Main Application Component
 * Sets up routing, tRPC client, and global providers
 */

import React from 'react';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { trpc, createTRPCClient } from './lib/trpc';

// Layout
import Layout from './components/Layout';

// Pages
import ProjectList from './pages/ProjectList';
import ProjectConfig from './pages/ProjectConfig';
import RouteSelection from './pages/RouteSelection';
import TestRunList from './pages/TestRunList';
import TestRunDetail from './pages/TestRunDetail';
import ReportView from './pages/ReportView';

// Create React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      retry: 1,
    },
  },
});

// Create tRPC client
const trpcClient = createTRPCClient();

/**
 * Main App component
 */
function App() {
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <ConfigProvider locale={zhCN}>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Layout />}>
                <Route index element={<ProjectList />} />
                <Route path="config/:projectId" element={<ProjectConfig />} />
                <Route path="routes/:projectId" element={<RouteSelection />} />
                <Route path="runs" element={<TestRunList />} />
                <Route path="runs/:runId" element={<TestRunDetail />} />
                <Route path="reports" element={<TestRunList />} />
                <Route path="reports/:runId" element={<ReportView />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </ConfigProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}

export default App;
