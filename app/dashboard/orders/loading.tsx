export default function AdminOrdersLoading() {
  return (
    <main className="stitch-admin admin-shell-bg dashboard-density min-h-screen px-3 py-4 text-[var(--foreground)] md:px-6 lg:pl-80">
      <section className="mx-auto grid w-full max-w-[1500px] gap-3">
        <div className="admin-hero-panel rounded-[14px] p-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="h-6 w-48 rounded-full bg-[var(--soft-surface)]" />
              <div className="mt-3 h-8 w-96 max-w-full rounded-full bg-[var(--soft-surface)]" />
              <div className="mt-2 h-4 w-[34rem] max-w-full rounded-full bg-[var(--soft-surface)]" />
            </div>
            <div className="h-28 rounded-xl bg-[var(--soft-surface)] xl:w-80" />
          </div>
        </div>

        <section className="grid gap-3 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="dashboard-panel p-3">
            <div className="h-5 w-40 rounded-full bg-[var(--soft-surface)]" />
            <div className="mt-3 grid gap-2">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="h-20 rounded-xl bg-[var(--soft-surface)]" />
              ))}
            </div>
          </div>

          <div className="dashboard-panel p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="h-6 w-56 rounded-full bg-[var(--soft-surface)]" />
                <div className="mt-2 h-4 w-72 max-w-full rounded-full bg-[var(--soft-surface)]" />
              </div>
              <div className="h-11 w-36 rounded-lg bg-[var(--soft-surface)]" />
            </div>

            <div className="mt-4 grid gap-2 xl:grid-cols-4">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="h-28 rounded-xl bg-[var(--soft-surface)]" />
              ))}
            </div>

            <div className="mt-3 grid gap-2 lg:grid-cols-3">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-32 rounded-xl bg-[var(--soft-surface)]" />
              ))}
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-[168px_168px_168px_minmax(0,1fr)_110px]">
              {[0, 1, 2, 3, 4].map((item) => (
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
        </section>
      </section>
    </main>
  );
}
