import { createBrowserRouter } from 'react-router-dom';
import RootLayout from '@/components/layout/RootLayout';
import WorkspacePage from '@/pages/WorkspacePage';
import LaborCostPage from '@/pages/LaborCostPage';
import NotFoundPage from '@/pages/NotFoundPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <NotFoundPage />,
    children: [
      { index: true, element: <WorkspacePage /> },
      { path: 'labor-cost', element: <LaborCostPage /> },
    ],
  },
]);
