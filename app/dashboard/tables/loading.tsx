export default function AdminTablesLoading() {
  return (
    <main className="stitch-admin admin-shell-bg dashboard-density min-h-screen px-3 py-4 text-[var(--foreground)] md:px-6 lg:pl-80">
      <section className="mx-auto grid w-full max-w-[1500px] gap-3">
        <div className="admin-hero-panel rounded-[14px] p-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="h-6 w-44 rounded-full bg-[var(--soft-surface)]" />
              <div className="mt-3 h-8 w-80 max-w-full rounded-full bg-[var(--soft-surface)]" />
              <div className="mt-2 h-4 w-72 max-w-full rounded-full bg-[var(--soft-surface)]" />
            </div>
            <div className="h-24 rounded-xl bg-[var(--soft-surface)] xl:w-72" />
          </div>
        </div>
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="admin-stat-tile h-28 rounded-[14px]" />
          ))}
        </section>
        <section className="dashboard-panel p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="h-6 w-44 rounded-full bg-[var(--soft-surface)]" />
              <div className="mt-2 h-4 w-72 max-w-full rounded-full bg-[var(--soft-surface)]" />
            </div>
            <div className="h-11 w-40 rounded-lg bg-[var(--soft-surface)]" />
          </div>
          <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="h-40 rounded-xl bg-[var(--soft-surface)]" />
            <div className="h-40 rounded-xl bg-[var(--soft-surface)]" />
          </div>
          <div className="mt-4 grid gap-6">
            {[0, 1].map((area) => (
              <div key={area}>
                <div className="h-5 w-36 rounded-full bg-[var(--soft-surface)]" />
                <div className="mt-3 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
                  {[0, 1, 2, 3, 4, 5].map((item) => (
                    <div key={item} className="h-28 rounded-xl bg-[var(--soft-surface)]" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
