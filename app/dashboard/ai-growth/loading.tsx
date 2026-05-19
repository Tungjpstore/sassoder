export default function AiGrowthLoading() {
  return (
    <main className="stitch-admin admin-shell-bg dashboard-density dashboard-route-fallback">
      <section className="mx-auto grid w-full max-w-[var(--admin-content-max)] gap-3">
        <div className="admin-hero-panel rounded-[14px] p-4">
          <div className="h-6 w-44 rounded-full bg-[var(--soft-surface)]" />
          <div className="mt-3 h-8 w-80 max-w-full rounded-full bg-[var(--soft-surface)]" />
          <div className="mt-2 h-4 w-[34rem] max-w-full rounded-full bg-[var(--soft-surface)]" />
        </div>
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <div key={item} className="admin-stat-tile h-28 rounded-[14px]" />
          ))}
        </section>
        <section className="dashboard-panel p-4">
          <div className="h-6 w-52 rounded-full bg-[var(--soft-surface)]" />
          <div className="mt-3 grid gap-3 xl:grid-cols-2">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-56 rounded-xl bg-[var(--soft-surface)]" />
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
