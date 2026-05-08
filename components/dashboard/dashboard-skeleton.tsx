export function StatCardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="admin-stat-tile animate-pulse rounded-[14px] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="h-3 w-24 rounded bg-[var(--surface-container-high)]/40" />
            <div className="h-9 w-9 rounded-[10px] bg-[var(--surface-container-high)]/40" />
          </div>
          <div className="mt-4 h-7 w-20 rounded bg-[var(--surface-container-high)]/40" />
          <div className="mt-2 h-4 w-32 rounded bg-[var(--surface-container-high)]/40" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="dashboard-muted-header flex gap-3 px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-3 flex-1 rounded bg-[var(--surface-container-high)]/40" />
        ))}
      </div>
      <div className="divide-y divide-[var(--border)]">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex animate-pulse gap-3 px-4 py-3">
            {Array.from({ length: cols }).map((_, j) => (
              <div
                key={j}
                className="h-4 flex-1 rounded bg-[var(--surface-container-high)]/40"
                style={{ animationDelay: `${(i * cols + j) * 60}ms` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function DrawerSkeleton() {
  return (
    <div className="grid animate-pulse gap-4">
      <div className="h-6 w-48 rounded bg-[var(--surface-container-high)]/40" />
      <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-4">
        <div className="h-4 w-32 rounded bg-[var(--surface-container-high)]/40" />
        <div className="mt-3 h-8 w-24 rounded bg-[var(--surface-container-high)]/40" />
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="h-16 rounded-lg bg-[var(--surface-container-high)]/40" />
          <div className="h-16 rounded-lg bg-[var(--surface-container-high)]/40" />
          <div className="h-16 rounded-lg bg-[var(--surface-container-high)]/40" />
          <div className="h-16 rounded-lg bg-[var(--surface-container-high)]/40" />
        </div>
      </div>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="h-4 w-40 rounded bg-[var(--surface-container-high)]/40" />
        <div className="mt-3 h-20 rounded-lg bg-[var(--surface-container-high)]/40" />
      </div>
    </div>
  );
}

export function PanelSkeleton() {
  return (
    <div className="dashboard-panel animate-pulse p-4">
      <div className="h-5 w-36 rounded bg-[var(--surface-container-high)]/40" />
      <div className="mt-2 h-4 w-64 rounded bg-[var(--surface-container-high)]/40" />
      <div className="mt-5 grid gap-3">
        <div className="h-16 rounded-xl bg-[var(--surface-container-high)]/40" />
        <div className="h-16 rounded-xl bg-[var(--surface-container-high)]/40" />
        <div className="h-16 rounded-xl bg-[var(--surface-container-high)]/40" />
      </div>
    </div>
  );
}
