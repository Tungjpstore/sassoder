export default function AdminReservationsLoading() {
  return (
    <main className="stitch-admin admin-shell-bg dashboard-density dashboard-route-fallback">
      <section className="mx-auto grid w-full max-w-[var(--admin-content-max)] gap-3">
        <div className="admin-hero-panel rounded-[14px] p-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-center">
            <div>
              <div className="h-6 w-64 rounded-full bg-[var(--soft-surface)]" />
              <div className="mt-3 h-8 w-96 max-w-full rounded-full bg-[var(--soft-surface)]" />
              <div className="mt-2 h-4 w-[36rem] max-w-full rounded-full bg-[var(--soft-surface)]" />
            </div>
            <div className="h-36 rounded-xl bg-[var(--soft-surface)]" />
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            {[0, 1, 2, 3, 4, 5].map((item) => (
              <div key={item} className="h-28 rounded-xl bg-[var(--soft-surface)]" />
            ))}
          </div>

          <div className="mt-4 grid gap-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-32 rounded-xl bg-[var(--soft-surface)]" />
            ))}
          </div>
        </div>

        <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="dashboard-panel p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="h-6 w-44 rounded-full bg-[var(--soft-surface)]" />
                <div className="mt-2 h-4 w-72 max-w-full rounded-full bg-[var(--soft-surface)]" />
              </div>
              <div className="h-8 w-48 rounded-full bg-[var(--soft-surface)]" />
            </div>

            <div className="mt-4 grid gap-2 lg:grid-cols-[180px_minmax(0,1fr)_120px]">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-11 rounded-lg bg-[var(--soft-surface)]" />
              ))}
            </div>

            <div className="mt-4 flex gap-2 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] p-1.5">
              {[0, 1, 2, 3, 4].map((item) => (
                <div key={item} className="h-11 w-28 shrink-0 rounded-md bg-[var(--surface)]" />
              ))}
            </div>

            <div className="mt-4 grid gap-2">
              {[0, 1, 2, 3, 4].map((item) => (
                <div key={item} className="h-24 rounded-xl bg-[var(--soft-surface)]" />
              ))}
            </div>
          </div>

          <aside className="hidden xl:block">
            <div className="dashboard-panel h-80 p-4" />
          </aside>
        </section>
      </section>
    </main>
  );
}
