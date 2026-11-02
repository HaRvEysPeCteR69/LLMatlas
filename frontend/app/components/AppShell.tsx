"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  BrainCircuit,
  ChevronRight,
  Cpu,
  Gauge,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Sparkles,
  ClipboardCheck,
} from "lucide-react";
import type { ReactNode } from "react";

type AppShellProps = {
  eyebrow?: string;
  title: string;
  description: string;
  children: ReactNode;
  actions?: ReactNode;
};

export default function AppShell({
  eyebrow,
  title,
  description,
  children,
  actions,
}: AppShellProps) {
  const pathname = usePathname();

  const navigation = [
    { label: "Overview", href: "/", icon: LayoutDashboard },
    { label: "Model Registry", href: "/models", icon: Cpu },
    { label: "Benchmark Runner", href: "/benchmarks", icon: Activity },
    { label: "Model Comparison", href: "/compare", icon: BarChart3 },
    { label: "Evaluations", href: "/evaluations", icon: ClipboardCheck },
  ];

  return (
    <div
      className="glass-app min-h-screen text-white"
      onMouseMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();

        event.currentTarget.style.setProperty(
          "--mx",
          `${event.clientX - rect.left}px`
        );

        event.currentTarget.style.setProperty(
          "--my",
          `${event.clientY - rect.top}px`
        );
      }}
    >
      <div className="cursor-glow" />

      <aside className="glass-sidebar">
        <Link href="/" className="brand">
          <span className="brand-icon">
            <BrainCircuit size={21} />
          </span>

          <span>
            <strong>
              LLMatlas <i>AI</i>
            </strong>
            <small>LLM EVALUATION PLATFORM</small>
          </span>
        </Link>

        <div className="sidebar-search">
          <Sparkles size={14} />
          <span>AI benchmarking workspace</span>
        </div>

        <div className="sidebar-label eyebrow">WORKSPACE</div>

        <nav className="sidebar-nav">
          {navigation.map((item) => {
            const Icon = item.icon;

            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link ${active ? "nav-active" : ""}`}
              >
                <Icon size={16} />
                <span>{item.label}</span>
                {active && <span className="active-dot" />}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-label eyebrow">SYSTEM</div>

          <div className="connection-card">
            <div className="connection-line">
              <span className="status-dot online" />
              Local workspace
            </div>
            <small>LLMatlas environment</small>
          </div>

          <div className="profile">
            <div className="avatar">M</div>

            <div className="profile-copy">
              <strong>LLMatlas</strong>
              <small>Developer workspace</small>
            </div>

            <Settings size={15} />
          </div>
        </div>
      </aside>

      <div className="dashboard-main">
        <header className="topbar">
          <div className="mobile-brand">
            <BrainCircuit size={19} />
            <strong>LLMatlas</strong>
          </div>

          <div className="breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{title}</strong>
          </div>

          <div className="topbar-actions">
            <div className="connection-line">
              <span className="status-dot online" />
              <span className="hidden sm:inline">Local environment</span>
            </div>

            <span className="user-chip">
              <Sparkles size={14} />
              <span>AI Workspace</span>
            </span>
          </div>
        </header>

        <main className="dashboard-content">
          <div className="page-heading">
            <div>
              {eyebrow && <p className="eyebrow">{eyebrow}</p>}

              <h1>
                {title.split(" ").slice(0, -1).join(" ")}{" "}
                <span>{title.split(" ").slice(-1)}</span>
              </h1>

              <p>{description}</p>
            </div>

            {actions}
          </div>

          {children}

          <footer className="dashboard-footer">
            <span>
              LLMatlas <i>·</i> LLM Benchmarking & Evaluation
            </span>

            <span>
              <ShieldCheck size={13} />
              Local development environment
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
