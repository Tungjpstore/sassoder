type DashboardRouteLoadingProps = {
  dense?: boolean;
};

export function DashboardRouteLoading({ dense = false }: DashboardRouteLoadingProps) {
  const metricCount = dense ? 4 : 6;
  const rowCount = dense ? 4 : 6;

  return (
    <main className="stitch-admin admin-shell-bg dashboard-density dashboard-route-fallback">
      <section className="mx-auto grid w-full max-w-[var(--admin-content-max)] gap-3">
        <div className="admin-hero-panel rounded-[14px] p-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-center">
            <div>
              <div className="h-6 w-44 rounded-full bg-[var(--soft-surface)]" />
              <div className="mt-3 h-8 w-96 max-w-full rounded-full bg-[var(--soft-surface)]" />
              <div className="mt-2 h-4 w-[34rem] max-w-full rounded-full bg-[var(--soft-surface)]" />
            </div>
            <div className="h-24 rounded-xl bg-[var(--soft-surface)]" />
          </div>
        </div>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: metricCount }, (_, index) => (
            <div key={index} className="admin-stat-tile h-28 rounded-[14px]" />
          ))}
        </section>

        <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="dashboard-panel p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="h-6 w-56 rounded-full bg-[var(--soft-surface)]" />
                <div className="mt-2 h-4 w-80 max-w-full rounded-full bg-[var(--soft-surface)]" />
              </div>
              <div className="h-11 w-40 rounded-lg bg-[var(--soft-surface)]" />
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-3">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-28 rounded-xl bg-[var(--soft-surface)]" />
              ))}
            </div>
            <div className="mt-4 grid gap-2">
              {Array.from({ length: rowCount }, (_, index) => (
                <div key={index} className="h-16 rounded-xl bg-[var(--soft-surface)]" />
              ))}
            </div>
          </div>
          <aside className="hidden grid gap-3 xl:grid">
            <div className="dashboard-panel h-52 p-4" />
            <div className="dashboard-panel h-52 p-4" />
          </aside>
        </section>
      </section>
    </main>
  );
}
