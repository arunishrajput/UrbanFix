import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router';
import { RouteError } from './RouteError';
import { RequireAuth, RequireRole } from './guards';
import { CitizenLayout } from './layouts/CitizenLayout';
import { DashboardLayout } from './layouts/DashboardLayout';
import { PageLoader } from './PageLoader';

const HomePage = lazy(() => import('../features/home/HomePage'));
const LoginPage = lazy(() => import('../features/auth/LoginPage'));
const RegisterPage = lazy(() => import('../features/auth/RegisterPage'));
const ReportPage = lazy(() => import('../features/report/ReportPage'));
const IssuePage = lazy(() => import('../features/issues/IssuePage'));
const MapPage = lazy(() => import('../features/map/MapPage'));
const ProfilePage = lazy(() => import('../features/profile/ProfilePage'));
const NotificationsPage = lazy(() => import('../features/notifications/NotificationsPage'));
const VerifyPage = lazy(() => import('../features/verify/VerifyPage'));
const DashboardPage = lazy(() => import('../features/dashboard/DashboardPage'));
const ManageIssuePage = lazy(() => import('../features/dashboard/ManageIssuePage'));
const AnalyticsPage = lazy(() => import('../features/analytics/AnalyticsPage'));
const AdminUsersPage = lazy(() => import('../features/admin/AdminUsersPage'));
const AdminCategoriesPage = lazy(() => import('../features/admin/AdminCategoriesPage'));
const AdminWardsPage = lazy(() => import('../features/admin/AdminWardsPage'));
const AdminModerationPage = lazy(() => import('../features/admin/AdminModerationPage'));
const AdminSettingsPage = lazy(() => import('../features/admin/AdminSettingsPage'));
const AdminAuditPage = lazy(() => import('../features/admin/AdminAuditPage'));
const NotFoundPage = lazy(() => import('./NotFoundPage'));

const page = (el: React.ReactNode) => <Suspense fallback={<PageLoader />}>{el}</Suspense>;

export const router = createBrowserRouter([
  {
    element: <CitizenLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: page(<HomePage />) },
      { path: 'login', element: page(<LoginPage />) },
      { path: 'register', element: page(<RegisterPage />) },
      { path: 'report', element: page(<ReportPage />) },
      { path: 'map', element: page(<MapPage />) },
      { path: 'issues/:id', element: page(<IssuePage />) },
      { path: 'verify/:id', element: page(<RequireAuth>{<VerifyPage />}</RequireAuth>) },
      { path: 'me', element: page(<RequireAuth>{<ProfilePage />}</RequireAuth>) },
      { path: 'notifications', element: page(<RequireAuth>{<NotificationsPage />}</RequireAuth>) },
      { path: '*', element: page(<NotFoundPage />) },
    ],
  },
  {
    path: 'dashboard',
    element: (
      <RequireRole roles={['STAFF', 'OFFICIAL', 'ADMIN']}>
        <DashboardLayout />
      </RequireRole>
    ),
    errorElement: <RouteError />,
    children: [
      { index: true, element: page(<DashboardPage />) },
      { path: 'assignments', element: page(<DashboardPage mode="assignments" />) },
      { path: 'issues/:id', element: page(<ManageIssuePage />) },
      { path: 'analytics', element: page(<AnalyticsPage />) },
    ],
  },
  {
    path: 'admin',
    element: (
      <RequireRole roles={['ADMIN']}>
        <DashboardLayout />
      </RequireRole>
    ),
    errorElement: <RouteError />,
    children: [
      { index: true, element: page(<AdminUsersPage />) },
      { path: 'categories', element: page(<AdminCategoriesPage />) },
      { path: 'wards', element: page(<AdminWardsPage />) },
      { path: 'moderation', element: page(<AdminModerationPage />) },
      { path: 'settings', element: page(<AdminSettingsPage />) },
      { path: 'audit', element: page(<AdminAuditPage />) },
    ],
  },
]);
