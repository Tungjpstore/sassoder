export default function AdminPaymentsLoading() {
  return (
    <main className="stitch-admin admin-shell-bg dashboard-density dashboard-route-fallback">
      <section className="mx-auto grid w-full max-w-[1500px] gap-3">
        <div className="admin-hero-panel rounded-[14px] p-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-center">
            <div>
              <div className="h-6 w-56 rounded-full bg-[var(--soft-surface)]" />
              <div className="mt-3 h-8 w-96 max-w-full rounded-full bg-[var(--soft-surface)]" />
              <div className="mt-2 h-4 w-[34rem] max-w-full rounded-full bg-[var(--soft-surface)]" />
            </div>
            <div className="h-28 rounded-xl bg-[var(--soft-surface)]" />
          </div>
        </div>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="admin-stat-tile h-28 rounded-[14px]" />
          ))}
        </section>

        <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="dashboard-panel p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="h-6 w-56 rounded-full bg-[var(--soft-surface)]" />
                <div className="mt-2 h-4 w-80 max-w-full rounded-full bg-[var(--soft-surface)]" />
              </div>
              <div className="h-11 w-36 rounded-lg bg-[var(--soft-surface)]" />
            </div>
            <div className="mt-4 grid gap-2 xl:grid-cols-[180px_160px_minmax(0,1fr)_110px]">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="h-11 rounded-lg bg-[var(--soft-surface)]" />
              ))}
            </div>
            <div className="mt-3 overflow-hidden rounded-xl border border-[var(--border)]">
              {[0, 1, 2, 3, 4].map((item) => (
                <div key={item} className="grid gap-3 border-b border-[var(--border)] px-4 py-3 last:border-b-0 lg:grid-cols-[1.2fr_0.9fr_1.5fr_0.9fr_1fr_112px]">
                  <div className="h-10 rounded-lg bg-[var(--soft-surface)]" />
                  <div className="h-10 rounded-lg bg-[var(--soft-surface)]" />
                  <div className="h-10 rounded-lg bg-[var(--soft-surface)]" />
                  <div className="h-10 rounded-lg bg-[var(--soft-surface)]" />
                  <div className="h-10 rounded-lg bg-[var(--soft-surface)]" />
                  <div className="h-10 rounded-lg bg-[var(--soft-surface)]" />
                </div>
              ))}
            </div>
          </div>

          <aside className="grid gap-3">
            {[0, 1].map((item) => (
              <div key={item} className="dashboard-panel h-56 p-4" />
            ))}
          </aside>
        </section>
      </section>
    </main>
  );
}
