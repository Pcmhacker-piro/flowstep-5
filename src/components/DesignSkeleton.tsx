// Responsive skeleton scaffold shown behind the streaming iframe so the
// canvas card never jumps: header, sidebar, KPI grid, chart card, table.
// Rendered at the inner 1440x960 viewport and scaled by the parent.
export function DesignSkeleton() {
  return (
    <div
      style={{ width: 1440, height: 960 }}
      className="flex flex-col bg-slate-50 text-slate-200"
      aria-hidden
    >
      {/* Header */}
      <div className="flex h-16 shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-6">
        <div className="h-6 w-28 rounded bg-slate-200 shimmer" />
        <div className="mx-auto h-9 w-[420px] rounded-lg bg-slate-100 shimmer" />
        <div className="ml-auto flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-slate-100 shimmer" />
          <div className="h-8 w-8 rounded-full bg-slate-200 shimmer" />
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <div className="flex w-[248px] shrink-0 flex-col gap-2 border-r border-slate-200 bg-white p-4">
          <div className="mb-3 h-7 w-32 rounded bg-slate-200 shimmer" />
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg px-2 py-2">
              <div className="h-5 w-5 rounded bg-slate-100 shimmer" />
              <div className={`h-3 rounded bg-slate-100 shimmer ${i % 3 === 0 ? "w-32" : i % 3 === 1 ? "w-24" : "w-28"}`} />
            </div>
          ))}
          <div className="mt-auto flex items-center gap-3 rounded-xl border border-slate-200 p-3">
            <div className="h-8 w-8 rounded-full bg-slate-200 shimmer" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-24 rounded bg-slate-200 shimmer" />
              <div className="h-2.5 w-16 rounded bg-slate-100 shimmer" />
            </div>
          </div>
        </div>

        {/* Main */}
        <div className="flex min-w-0 flex-1 flex-col gap-6 p-8">
          {/* Title row */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="h-7 w-64 rounded bg-slate-200 shimmer" />
              <div className="h-3.5 w-96 rounded bg-slate-100 shimmer" />
            </div>
            <div className="h-10 w-36 rounded-lg bg-slate-200 shimmer" />
          </div>

          {/* KPI grid */}
          <div className="grid grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="h-3 w-20 rounded bg-slate-100 shimmer" />
                  <div className="h-6 w-16 rounded bg-slate-100 shimmer" />
                </div>
                <div className="mt-4 h-8 w-24 rounded bg-slate-200 shimmer" />
                <div className="mt-3 h-2.5 w-28 rounded bg-slate-100 shimmer" />
              </div>
            ))}
          </div>

          {/* Chart card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="h-4 w-40 rounded bg-slate-200 shimmer" />
                <div className="h-3 w-56 rounded bg-slate-100 shimmer" />
              </div>
              <div className="flex gap-2">
                <div className="h-7 w-16 rounded-full bg-slate-100 shimmer" />
                <div className="h-7 w-16 rounded-full bg-slate-100 shimmer" />
              </div>
            </div>
            <div className="mt-6 h-56 w-full rounded-lg bg-gradient-to-b from-slate-100 to-slate-50 shimmer" />
          </div>

          {/* Table */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <div className="h-4 w-32 rounded bg-slate-200 shimmer" />
              <div className="flex gap-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-7 w-20 rounded-full bg-slate-100 shimmer" />
                ))}
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="grid grid-cols-[1.5fr_2fr_1fr_1fr_1fr] items-center gap-4 px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-slate-200 shimmer" />
                    <div className="h-3 w-24 rounded bg-slate-100 shimmer" />
                  </div>
                  <div className="h-3 w-48 rounded bg-slate-100 shimmer" />
                  <div className="h-6 w-16 rounded-full bg-slate-100 shimmer" />
                  <div className="h-3 w-14 rounded bg-slate-100 shimmer" />
                  <div className="h-3 w-20 rounded bg-slate-100 shimmer" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
