export default function AdminKitchenLoading() {
  return (
    <main className="stitch-admin admin-shell-bg min-h-screen px-4 py-6 text-[var(--foreground)] md:px-8 lg:pl-80">
      <section className="mx-auto grid w-full max-w-[1500px] gap-5">
        <div className="dashboard-panel h-36 p-5">
          <div className="h-4 w-32 rounded-full bg-[var(--soft-surface)]" />
          <div className="mt-4 h-8 w-72 max-w-full rounded-full bg-[var(--soft-surface)]" />
          <div className="mt-5 flex gap-2">
            <div className="h-6 w-28 rounded-full bg-[var(--soft-surface)]" />
            <div className="h-6 w-24 rounded-full bg-[var(--soft-surface)]" />
          </div>
        </div>
        <div className="dashboard-panel h-16" />
        <section className="grid gap-4 lg:grid-cols-2">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="dashboard-panel h-64" />
          ))}
        </section>
      </section>
    </main>
  );
}
