import { createBrowserRouter, Navigate } from 'react-router';
import { AuthProvider } from '../contexts/AuthContext';
import { VisibilityProvider } from '../contexts/VisibilityContext';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { PinGuard } from './components/PinGuard';
import { Outlet } from 'react-router';
import { Toaster } from 'sonner';

import { useAuth } from '../contexts/AuthContext';
import { useMessaging } from './hooks/useMessaging';

import { ThemeProvider } from '../contexts/ThemeProvider';

function RootContent() {
  const { user } = useAuth();
  useMessaging(user?.uid);
  return (
    <ThemeProvider>
      <VisibilityProvider>
        <Outlet />
        <Toaster />
      </VisibilityProvider>
    </ThemeProvider>
  );
}

function Root() {
  return (
    <AuthProvider>
      <RootContent />
    </AuthProvider>
  );
}

export const router = createBrowserRouter([
  {
    path: '/',
    Component: Root,
    children: [
      { index: true, Component: Login },
      { path: 'dashboard', element: <PinGuard><Dashboard /></PinGuard> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);