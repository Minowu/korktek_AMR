/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, Suspense, lazy } from 'react';
import { LoginScreen } from './components/LoginScreen';
import { Smartphone, LayoutGrid, Terminal, LogOut, ShieldAlert } from 'lucide-react';
import { User } from './types';
import { api } from './services/api';

const StationControl = lazy(() => import('./components/StationControl').then(m => ({ default: m.StationControl })));
const StationSelector = lazy(() => import('./components/StationSelector').then(m => ({ default: m.StationSelector })));
const MultiPdaView = lazy(() => import('./components/MultiPdaView').then(m => ({ default: m.MultiPdaView })));
const LogsDrawer = lazy(() => import('./components/LogsDrawer').then(m => ({ default: m.LogsDrawer })));
const AMRStatusBoard = lazy(() => import('./components/AMRStatusBoard'));

export default function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'single' | 'simulator'>('single');
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('user');
    if (saved) {
      try {
        const u = JSON.parse(saved);
        api.setToken(u.token);
        return u;
      } catch (e) {
        return null;
      }
    }
    return null;
  });

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('user');
    api.setToken(null);
  };

  // Token hết hạn (server trả 401) -> tự động đăng xuất, quay về trang login
  useEffect(() => {
    api.setOnUnauthorized(handleLogout);
    return () => api.setOnUnauthorized(null);
  }, []);

  // Handle URL navigation
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (path: string) => {
    window.history.pushState(null, '', path);
    setCurrentPath(path);
  };

  // Match /control/:line/:station
  const matchRoute = () => {
    const match = currentPath.match(/^\/control\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)\/?$/);
    if (match) {
      return {
        isStationRoute: true,
        lineKey: match[1].toLowerCase(),
        stationKey: match[2].toLowerCase(),
      };
    }
    return { isStationRoute: false };
  };

  const routeInfo = matchRoute();

  if (!user) {
    return (
      <LoginScreen
        onLoginSuccess={(u) => {
          setUser(u);
          localStorage.setItem('user', JSON.stringify(u));
          api.setToken(u.token);
          if (u.permissions.includes('*')) {
            navigateTo('/main');
          } else {
            navigateTo(u.permissions[0]);
          }
        }}
      />
    );
  }

  const checkPermission = (path: string) => {
    if (user.permissions.includes('*')) return true;
    return user.permissions.some(p => path.startsWith(p));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200 text-slate-900 flex flex-col font-sans selection:bg-primary selection:text-white">
      {/* Top Bar for Simulator / Developer Switcher (Hidden or unobtrusive on small PDA) */}
      <header className="border-b border-slate-200 bg-slate-50/90 sticky top-0 z-40 backdrop-blur-md px-3 py-2">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
          <button
            onClick={() => navigateTo('/')}
            className="flex items-center gap-2 font-black text-sm text-slate-900 tracking-tight hover:text-primary transition-colors"
          >
            <div className="w-6 h-6 rounded-lg bg-primary flex items-center justify-center text-white text-xs font-black">
              A
            </div>
            <span className="hidden text-main sm:inline">AMR Control Panel</span>
            <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-primary">
              {routeInfo.isStationRoute
                ? `${routeInfo.lineKey.toUpperCase()} / ${routeInfo.stationKey.toUpperCase()}`
                : 'Trạm điều khiển'}
            </span>
          </button>

          {/* Quick Nav Mode */}
          <div className="flex items-center gap-1.5 text-xs">
            <button
              onClick={() => {
                setViewMode('single');
                if (!routeInfo.isStationRoute) {
                  navigateTo('/control/line-a/head');
                }
              }}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-medium transition-colors ${viewMode === 'single'
                ? 'bg-slate-100 text-primary border border-slate-300'
                : 'text-slate-600 hover:text-slate-800'
                }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">PDA Trạm</span>
            </button>

            {user?.permissions.includes('*') && (
              <button
                onClick={() => {
                  setViewMode('simulator');
                  navigateTo('/');
                }}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-medium transition-colors ${viewMode === 'simulator'
                  ? 'bg-slate-100 text-primary border border-slate-300'
                  : 'text-slate-600 hover:text-slate-800'
                  }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">Mô phỏng Đa PDA</span>
              </button>
            )}

            <button
              onClick={handleLogout}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-medium text-red-600 hover:bg-red-50 transition-colors ml-2"
              title="Đăng xuất"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden xs:inline">Đăng xuất</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col p-3 sm:p-5">
        <Suspense fallback={
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          </div>
        }>
          {viewMode === 'simulator' ? (
            <MultiPdaView onOpenLogs={() => setIsLogsOpen(true)} />
          ) : routeInfo.isStationRoute && routeInfo.lineKey && routeInfo.stationKey ? (
            !checkPermission(`/control/${routeInfo.lineKey}/${routeInfo.stationKey}`) ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
                <ShieldAlert className="w-16 h-16 text-red-500 mb-4 opacity-80" />
                <h2 className="text-xl font-bold text-slate-900 mb-2">Từ chối truy cập</h2>
                <p className="text-slate-600 max-w-md">Tài khoản của bạn không có quyền thao tác trên trạm này. Vui lòng liên hệ quản trị viên.</p>
              </div>
            ) : (
              <StationControl
                lineKey={routeInfo.lineKey}
                stationKey={routeInfo.stationKey}
                onNavigateHome={() => navigateTo('/')}
                onOpenLogs={() => setIsLogsOpen(true)}
                isAdmin={user.permissions.includes('*')}
              />
            )
          ) : (
            <div className="flex flex-col gap-6 w-full max-w-6xl mx-auto">
              <StationSelector
                onSelectStation={(line, station) => {
                  navigateTo(`/control/${line}/${station}`);
                }}
                onOpenLogs={() => setIsLogsOpen(true)}
                isAdmin={user.permissions.includes('*')}
                permissions={user.permissions}
              />
              <div className="mt-8">
                <h2 className="text-xl font-bold text-slate-800 mb-4 px-2">Trạng thái AMR Toàn Hệ Thống</h2>
                <AMRStatusBoard />
              </div>
            </div>
          )}
        </Suspense>
      </main>

      {/* Communication & Activity Logs Drawer */}
      <Suspense fallback={null}>
        <LogsDrawer isOpen={isLogsOpen} onClose={() => setIsLogsOpen(false)} />
      </Suspense>
    </div>
  );
}
