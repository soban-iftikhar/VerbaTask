import { useLocation, Link } from 'react-router';
import { useUiStore } from '../../lib/store';
import { Sun, Moon, Menu, Circle, Home } from 'lucide-react';

const ROUTE_TITLES = {
  '/dashboard': 'Overview',
  '/dashboard/inventory': 'Inventory',
  '/dashboard/orders': 'Orders',
  '/dashboard/workflows': 'Workflows',
  '/dashboard/approvals': 'Approvals',
  '/dashboard/settings': 'Store Settings',
};

export function TopBar({ onOpenMobileMenu, realtime }) {
  const location = useLocation();
  const { theme, setTheme } = useUiStore();

  const title = ROUTE_TITLES[location.pathname] || 'Dashboard';
  const status = realtime?.connectionStatus || 'connected';

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <header className="h-16 sticky top-0 z-20 w-full glass-nav px-3 sm:px-6 flex items-center justify-between transition-colors duration-200">
      {/* Left: Mobile hamburger + Page Title */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="md:hidden p-2 min-w-[38px] min-h-[38px] flex items-center justify-center text-zinc-700 dark:text-ink-secondary hover:text-zinc-950 dark:hover:text-ink rounded-lg hover:bg-zinc-100 dark:hover:bg-canvas-soft transition-colors cursor-pointer"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <h1 className="text-base sm:text-lg font-bold tracking-tight text-zinc-950 dark:text-white font-heading truncate">
          {title}
        </h1>
      </div>

      {/* Right: Landing page link + Live System indicator + Theme Toggle */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-700 hover:text-zinc-950 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 dark:text-zinc-300 dark:hover:text-white dark:bg-white/[0.04] dark:border-white/10 dark:hover:bg-white/[0.08] transition-colors"
          title="Return to Public Landing Page"
        >
          <Home className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span className="hidden sm:inline">Landing Page</span>
        </Link>

        {status === 'connected' && (
          <button
            type="button"
            onClick={realtime?.forceSync}
            title="Real-time live sync active. Click to refresh instantly."
            className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold cursor-pointer hover:bg-emerald-500/20 transition-colors"
          >
            <Circle className="w-2 h-2 fill-current animate-pulse text-emerald-500 dark:text-emerald-400" />
            <span>Live Sync</span>
          </button>
        )}

        {status === 'connecting' && (
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-medium">
            <Circle className="w-2 h-2 fill-current animate-pulse text-amber-500 dark:text-amber-400" />
            <span>Connecting...</span>
          </div>
        )}

        {status === 'disconnected' && (
          <button
            type="button"
            onClick={realtime?.forceSync}
            title="Disconnected. Click to reconnect & sync."
            className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-500/10 border border-zinc-500/20 text-zinc-600 dark:text-zinc-400 text-xs font-medium hover:bg-zinc-500/20 cursor-pointer transition-colors"
          >
            <Circle className="w-2 h-2 fill-current text-zinc-400" />
            <span>Offline (Click to sync)</span>
          </button>
        )}

        <button
          type="button"
          onClick={toggleTheme}
          className="p-2 min-w-[38px] min-h-[38px] flex items-center justify-center text-zinc-700 hover:text-zinc-950 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 dark:text-zinc-400 dark:hover:text-white dark:bg-white/[0.04] dark:border-white/10 dark:hover:bg-white/[0.08] rounded-lg transition-colors cursor-pointer"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-zinc-700" />
          )}
        </button>
      </div>
    </header>
  );
}

export default TopBar;
