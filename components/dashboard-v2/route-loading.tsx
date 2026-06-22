type DashboardRouteLoadingV2Props = {
  dense?: boolean;
};

export function DashboardRouteLoadingV2({ dense = false }: DashboardRouteLoadingV2Props) {
  const metricCount = dense ? 4 : 6;
  const rowCount = dense ? 4 : 6;

  return (
    <main data-dash="v2" className="min-h-screen bg-[var(--d-bg)] px-4 py-4 text-[var(--d-text)] sm:px-5 lg:px-6">
      <section className="mx-auto grid w-full max-w-[var(--admin-content-max)] gap-[var(--d-s-4)]">
        <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-5)] shadow-[var(--d-sh-sm)]">
          <div className="grid gap-[var(--d-s-4)] xl:grid-cols-[minmax(0,1fr)_320px] xl:items-center">
            <div>
              <div className="h-4 w-36 animate-pulse rounded-[var(--d-r-pill)] bg-[var(--d-surface-2)]" />
              <div className="mt-3 h-9 w-96 max-w-full animate-pulse rounded-[var(--d-r-pill)] bg-[var(--d-surface-2)]" />
              <div className="mt-2 h-4 w-[34rem] max-w-full animate-pulse rounded-[var(--d-r-pill)] bg-[var(--d-surface-2)]" />
            </div>
            <div className="h-24 animate-pulse rounded-[var(--d-r-md)] bg-[var(--d-surface-2)]" />
          </div>
        </section>

        <section className="grid gap-[var(--d-s-3)] md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: metricCount }, (_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] shadow-[var(--d-sh-sm)]" />
          ))}
        </section>

        <section className="grid gap-[var(--d-s-4)] xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-5)] shadow-[var(--d-sh-sm)]">
            <div className="flex flex-col gap-[var(--d-s-3)] sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="h-6 w-56 animate-pulse rounded-[var(--d-r-pill)] bg-[var(--d-surface-2)]" />
                <div className="mt-2 h-4 w-80 max-w-full animate-pulse rounded-[var(--d-r-pill)] bg-[var(--d-surface-2)]" />
              </div>
              <div className="h-10 w-40 animate-pulse rounded-[var(--d-r-md)] bg-[var(--d-surface-2)]" />
            </div>
            <div className="mt-[var(--d-s-4)] grid gap-[var(--d-s-3)] md:grid-cols-3">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-28 animate-pulse rounded-[var(--d-r-md)] bg-[var(--d-surface-2)]" />
              ))}
            </div>
            <div className="mt-[var(--d-s-4)] grid gap-[var(--d-s-2)]">
              {Array.from({ length: rowCount }, (_, index) => (
                <div key={index} className="h-16 animate-pulse rounded-[var(--d-r-md)] bg-[var(--d-surface-2)]" />
              ))}
            </div>
          </div>
          <aside className="hidden gap-[var(--d-s-3)] xl:grid">
            <div className="h-52 animate-pulse rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] shadow-[var(--d-sh-sm)]" />
            <div className="h-40 animate-pulse rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] shadow-[var(--d-sh-sm)]" />
          </aside>
        </section>
      </section>
    </main>
  );
}
