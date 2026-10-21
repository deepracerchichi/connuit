import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ChevronLeft, History, KeyRound, LayoutGrid, LogOut, Workflow, X } from "lucide-react";
import { clearToken, getUser, isLoggedIn } from "../api/client";
import { MenuPattern } from "../components/Nav";
import { cn } from "../lib/cn";

const TABS = [
  { to: "/dashboard", label: "Overview", icon: LayoutGrid, end: true },
  { to: "/dashboard/workflows", label: "Workflows", icon: Workflow, end: false },
  { to: "/dashboard/runs", label: "Runs", icon: History, end: false },
  { to: "/dashboard/credentials", label: "Credentials", icon: KeyRound, end: false },
];

// Logged-out visitors (or expired tokens) never see the dashboard.
export function RequireAuth({ children }: { children: ReactNode }) {
  return isLoggedIn() ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function DashboardLayout() {
  const navigate = useNavigate();
  const user = getUser();
  const [collapsed, toggleCollapsed] = useCollapsed();

  function logOut() {
    clearToken();
    navigate("/login");
  }

  return (
    <div
      className={cn(
        "min-h-svh bg-paper text-ink lg:grid lg:transition-[grid-template-columns] lg:duration-500 lg:ease-[cubic-bezier(0.25,1,0.5,1)]",
        collapsed ? "lg:grid-cols-[6rem_1fr]" : "lg:grid-cols-[17rem_1fr]",
      )}
    >
      {/* ---------- Desktop sidebar: a dark panel inside the same 8px frame as the hero ---------- */}
      <aside className="hidden p-2 lg:block">
        <div className="sticky top-2 flex h-[calc(100svh-1rem)] flex-col rounded-3xl bg-ink p-4 text-white">
          {/* Collapse handle on the panel's edge */}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            title={`${collapsed ? "Expand" : "Collapse"} sidebar (Ctrl+B)`}
            className="absolute -right-3 top-10 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-paper text-ink shadow-md ring-1 ring-ink/10 transition-colors hover:bg-accent"
          >
            <ChevronLeft className={cn("h-4 w-4 transition-transform duration-500", collapsed && "rotate-180")} strokeWidth={2} />
          </button>

          {/* When collapsed, the box narrows so only the mark at the left of the logo shows */}
          <Link
            to="/"
            aria-label="Connuit home"
            className={cn("overflow-hidden py-3 transition-[width,padding] duration-500", collapsed ? "w-12 px-0" : "w-full px-2")}
          >
            <img src="/Logo.svg" alt="" className="h-7 w-auto max-w-none" />
          </Link>

          <nav className="mt-10 flex flex-col gap-1" aria-label="Dashboard">
            {TABS.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                title={collapsed ? label : undefined}
                aria-label={label}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 overflow-hidden whitespace-nowrap rounded-xl px-3 py-2.5 font-mono text-sm uppercase transition-colors",
                    isActive ? "bg-accent text-ink" : "text-white/70 hover:bg-white/10 hover:text-white",
                  )
                }
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                <span className={cn("transition-opacity duration-300", collapsed && "opacity-0")}>{label}</span>
              </NavLink>
            ))}
          </nav>

          {collapsed ? (
            <button
              type="button"
              onClick={logOut}
              title="Log out"
              aria-label="Log out"
              className="mt-auto flex h-10 w-10 items-center justify-center self-center rounded-xl text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <LogOut className="h-4 w-4" strokeWidth={1.75} />
            </button>
          ) : (
            <div className="mt-auto overflow-hidden whitespace-nowrap rounded-2xl bg-white/5 p-4">
              <p className="text-xs text-white/50">Signed in as</p>
              <p className="mt-0.5 truncate text-sm">{user?.email ?? "you"}</p>
              <button
                type="button"
                onClick={logOut}
                className="mt-4 inline-flex items-center gap-2 text-sm text-white/70 transition-colors hover:text-white"
              >
                <LogOut className="h-4 w-4" strokeWidth={1.75} /> Log out
              </button>
            </div>
          )}
        </div>
      </aside>

      <MobileNav email={user?.email} onLogOut={logOut} />

      <main className="min-w-0 px-5 pb-20 pt-4 lg:px-12 lg:pt-12">
        <Outlet />
      </main>
    </div>
  );
}

/* ---------- Collapsed or not, remembered between visits; Ctrl/Cmd+B toggles it ---------- */

const COLLAPSED_KEY = "sidebar-collapsed";

function useCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === "1";
    } catch {
      return false; // storage blocked (private mode): start expanded
    }
  });

  // Save whenever it changes, however it was changed (button or shortcut).
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
      // not remembered, still works
    }
  }, [collapsed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setCollapsed((c) => !c);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggle = useCallback(() => setCollapsed((c) => !c), []);
  return [collapsed, toggle];
}

/* ---------- Mobile: the same IntegratedBio-style bar and full-screen menu as the landing page ---------- */

function MobileNav({ email, onLogOut }: { email?: string; onLogOut: () => void }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();

  // Close when the route changes (a tab was tapped).
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    document.documentElement.style.overflow = open ? "hidden" : "";
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useGSAP(() => {
    const panel = panelRef.current;
    if (!open || !panel || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap
      .timeline()
      .fromTo(panel, { clipPath: "inset(0% 0% 100% 0% round 24px)" }, { clipPath: "inset(0% 0% 0% 0% round 24px)", duration: 0.55, ease: "expo.out" })
      .fromTo(panel.querySelectorAll(".js-menu-rise"), { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.06, ease: "power3.out" }, "-=0.35");
  }, { dependencies: [open] });

  return (
    <>
      <div className="sticky top-0 z-40 p-3 lg:hidden">
        <div className="flex h-16 items-center justify-between rounded-2xl bg-white/85 py-2 pl-4 pr-2 shadow-sm backdrop-blur-md">
          <Link to="/">
            <img src="/Logo-scroll.svg" alt="Connuit" className="h-7 w-auto" />
          </Link>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            aria-expanded={open}
            className="flex h-12 w-12 flex-col items-center justify-center gap-1.5 rounded-xl bg-ink"
          >
            <span className="h-px w-5 bg-accent" />
            <span className="h-px w-5 bg-accent" />
          </button>
        </div>
      </div>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className="fixed inset-2 z-60 flex flex-col overflow-hidden rounded-3xl bg-ink text-white lg:hidden"
        >
          <MenuPattern />

          <div className="relative mx-3 mt-3 flex h-16 items-center justify-between rounded-2xl bg-white/10 py-2 pl-4 pr-2">
            <img src="/Logo.svg" alt="Connuit" className="h-7 w-auto" />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="flex h-12 w-12 items-center justify-center rounded-xl border border-accent"
            >
              <X className="h-5 w-5" strokeWidth={1.5} />
            </button>
          </div>

          <ul className="relative flex flex-1 flex-col items-center justify-center gap-1 text-center text-5xl tracking-tight">
            {TABS.map(({ to, label, end }) => (
              <li key={to} className="js-menu-rise">
                <NavLink to={to} end={end} className={({ isActive }) => (isActive ? "text-accent" : "")}>
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>

          <div className="js-menu-rise relative flex flex-col items-center gap-3 pb-10">
            {email && <span className="text-sm text-white/50">{email}</span>}
            <button type="button" onClick={onLogOut} className="border-b border-accent pb-1 text-lg">
              Log out
            </button>
          </div>
        </div>
      )}
    </>
  );
}
