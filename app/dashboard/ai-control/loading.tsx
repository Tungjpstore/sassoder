export default function AiControlLoading() {
  return (
    <main className="stitch-admin admin-shell-bg dashboard-density dashboard-route-fallback">
      <section className="mx-auto grid w-full max-w-[var(--admin-content-max)] gap-3">
        <div className="admin-hero-panel rounded-[14px] p-4">
          <div className="h-6 w-48 rounded-full bg-[var(--soft-surface)]" />
          <div className="mt-3 h-8 w-80 max-w-full rounded-full bg-[var(--soft-surface)]" />
          <div className="mt-2 h-4 w-[34rem] max-w-full rounded-full bg-[var(--soft-surface)]" />
        </div>
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <div key={item} className="admin-stat-tile h-28 rounded-[14px]" />
          ))}
        </section>
        <section className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
          <div className="dashboard-panel h-80 p-4" />
          <div className="dashboard-panel h-80 p-4" />
        </section>
        {[0, 1, 2].map((item) => (
          <section key={item} className="dashboard-panel p-4">
            <div className="h-6 w-52 rounded-full bg-[var(--soft-surface)]" />
            <div className="mt-3 grid gap-3 xl:grid-cols-3">
              {[0, 1, 2].map((card) => (
                <div key={card} className="h-40 rounded-xl bg-[var(--soft-surface)]" />
              ))}
            </div>
          </section>
        ))}
      </section>
    </main>
  );
}
