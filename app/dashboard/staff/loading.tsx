export default function AdminStaffLoading() {
  return (
    <main className="stitch-admin admin-shell-bg dashboard-density min-h-screen px-3 py-4 text-[var(--foreground)] md:px-6 lg:pl-80">
      <section className="mx-auto grid w-full max-w-[1500px] gap-3">
        <div className="staff-overview-hero staff-ops-hero-grid rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[var(--shadow-soft)]">
          <div className="grid gap-3">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-lg bg-[var(--soft-surface)]" />
              <div className="grid flex-1 gap-2">
                <div className="h-4 w-40 rounded-full bg-[var(--soft-surface)]" />
                <div className="h-7 w-72 max-w-full rounded-full bg-[var(--soft-surface)]" />
                <div className="h-3 w-64 max-w-full rounded-full bg-[var(--soft-surface)]" />
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-14 rounded-lg bg-[var(--soft-surface)]" />
              ))}
            </div>
          </div>
          <div className="hidden h-32 rounded-xl bg-[var(--soft-surface)] md:block" />
          <div className="grid content-start gap-2 sm:grid-cols-3 md:flex md:justify-end">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-9 rounded-lg bg-[var(--soft-surface)] md:w-28" />
            ))}
          </div>
        </div>

        <section className="grid gap-2 xl:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
          <div className="staff-screen-card rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <div className="h-5 w-52 rounded-full bg-[var(--soft-surface)]" />
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="h-28 rounded-xl bg-[var(--soft-surface)]" />
              ))}
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-24 rounded-xl bg-[var(--soft-surface)]" />
              ))}
            </div>
          </div>
          <div className="staff-screen-card rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <div className="h-5 w-32 rounded-full bg-[var(--soft-surface)]" />
            <div className="mt-3 grid gap-2">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-14 rounded-xl bg-[var(--soft-surface)]" />
              ))}
            </div>
          </div>
        </section>

        <div className="grid gap-2 xl:grid-cols-[1.4fr_1.35fr_0.9fr]">
          {[0, 1, 2].map((group) => (
            <div key={group} className="staff-screen-card rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2">
              <div className="mb-2 h-4 w-28 rounded-full bg-[var(--soft-surface)]" />
              <div className="grid gap-1 sm:grid-cols-2">
                {[0, 1, 2, 3].map((item) => (
                  <div key={item} className="h-10 rounded-lg bg-[var(--soft-surface)]" />
                ))}
              </div>
            </div>
          ))}
        </div>

        <section className="staff-screen-card rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <div className="h-14 border-b border-[var(--border)]" />
          <div className="grid gap-2 p-3 md:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((item) => (
              <div key={item} className="h-20 rounded-xl bg-[var(--soft-surface)]" />
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
