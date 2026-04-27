"use client";

import { Package, Activity, CheckCircle, Clock } from "lucide-react";
import { useDashboardData } from "@/lib/hooks/useDashboardData";
import { LazyDashboardCharts } from "@/components/lazy/LazyDashboardCharts";
import { ChartSkeleton } from "@/components/skeletons/LoadingSkeletons";
import type { EventType } from "@/lib/types";
import { EVENT_TYPE_CONFIG } from "@/lib/eventTypeConfig";

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
}) {
  return (
    <div className="border border-[var(--card-border)] bg-[var(--card)] rounded-xl p-5 flex items-center gap-4 shadow-sm">
      <div className="p-2 rounded-lg bg-[var(--muted-bg)]">
        <Icon size={20} className="text-[var(--foreground)]" />
      </div>
      <div>
        <p className="text-sm text-[var(--muted)]">{label}</p>
        <p className="text-2xl font-bold text-[var(--foreground)]">{value}</p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { stats, dailyCounts, eventTypeCounts, recentEvents } = useDashboardData();

  return (
    <main className="p-6 space-y-8 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-[var(--foreground)]">Dashboard</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Products" value={stats.totalProducts} icon={Package} />
        <StatCard label="Total Events" value={stats.totalEvents} icon={Activity} />
        <StatCard label="Active Products" value={stats.activeProducts} icon={CheckCircle} />
        <StatCard label="Last 24 h" value={stats.recentActivity} icon={Clock} />
      </div>

      {/* Charts row — lazy loaded */}
      <LazyDashboardCharts
        dailyCounts={dailyCounts}
        eventTypeCounts={eventTypeCounts}
      />

      {/* Recent events table */}
      <div className="border border-[var(--card-border)] bg-[var(--card)] rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--card-border)]">
          <p className="text-sm font-semibold text-[var(--foreground)]">Recent Events</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--muted)] border-b border-[var(--card-border)]">
                <th className="px-5 py-3 font-medium">Product</th>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 font-medium">Location</th>
                <th className="px-5 py-3 font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {recentEvents.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-6 text-center text-[var(--muted)]">
                    No events yet.
                  </td>
                </tr>
              ) : (
                recentEvents.map((e, i) => (
                  <tr
                    key={i}
                    className="border-b border-[var(--card-border)] last:border-0 hover:bg-[var(--muted-bg)] transition-colors"
                  >
                    <td className="px-5 py-3 font-mono text-xs text-[var(--foreground)]">
                      {e.productId}
                    </td>
                    <td className="px-5 py-3">
                      {(() => {
                        const cfg = EVENT_TYPE_CONFIG[e.eventType as EventType];
                        const Icon = cfg?.icon;
                        return (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg?.badgeClass ?? "bg-gray-100 text-gray-800"}`}>
                            {Icon && <Icon size={11} />}
                            {cfg?.label ?? e.eventType}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-5 py-3 text-[var(--foreground)]">{e.location}</td>
                    <td className="px-5 py-3 text-[var(--muted)]">
                      {new Date(e.timestamp).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
