export default function AdminKitchenLoading() {
  return (
    <main className="stitch-admin admin-shell-bg dashboard-density min-h-screen px-3 py-4 text-[var(--foreground)] md:px-6 lg:pl-80">
      <section className="mx-auto grid w-full max-w-[1500px] gap-3">
        <div className="dashboard-panel p-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="h-6 w-36 rounded-full bg-[var(--soft-surface)]" />
              <div className="mt-3 h-8 w-72 max-w-full rounded-full bg-[var(--soft-surface)]" />
              <div className="mt-2 h-4 w-64 max-w-full rounded-full bg-[var(--soft-surface)]" />
            </div>
            <div className="h-10 w-28 rounded-lg bg-[var(--soft-surface)]" />
          </div>
        </div>
        <section className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="dashboard-panel h-28" />
          ))}
        </section>
        <section className="dashboard-panel p-3">
          <div className="h-5 w-44 rounded-full bg-[var(--soft-surface)]" />
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-20 rounded-xl bg-[var(--soft-surface)]" />
            ))}
          </div>
        </section>
        <section className="grid gap-3 xl:grid-cols-3">
          {[0, 1, 2].map((column) => (
            <div key={column} className="dashboard-panel overflow-hidden p-0">
              <div className="h-14 border-b border-[var(--border)] bg-[var(--soft-surface)]" />
              <div className="grid gap-3 p-3">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="h-48 rounded-xl bg-[var(--soft-surface)]" />
                ))}
              </div>
            </div>
          ))}
        </section>
      </section>
    </main>
  );
}
