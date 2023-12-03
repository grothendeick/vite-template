import type { TRouteObject } from '@lomray/vite-ssr-boost/interfaces/route-object';
import AppLayout from '@components/layouts/app';
import NotFound from '@pages/not-found';
import RouteManager from '@services/route-manager';
import DetailsRoutes from './details';
import Home from '@pages/home';

/**
 * Application routes
 */
const routes: TRouteObject[] = [
  {
    ErrorBoundary: NotFound,
    Component: AppLayout,
    children: [
      {
        index: true,
        Component: Home,
      },
      {
        path: RouteManager.path('details'),
        children: DetailsRoutes,
      },
      {
        path: RouteManager.path('errorBoundary'),
        lazy: () => import('@pages/error-boundary'),
      },
      {
        path: RouteManager.path('nestedSuspense'),
        lazy: () => import('@pages/nested-suspense'),
      },
      {
        path: RouteManager.path('redirect'),
        lazy: () => import('@pages/redirect'),
      },
    ],
  },
];

export default routes;
