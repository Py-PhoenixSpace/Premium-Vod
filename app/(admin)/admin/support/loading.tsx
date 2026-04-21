export default function AdminSupportLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-muted/50" />
            <div className="h-7 w-48 rounded-lg bg-muted/50" />
          </div>
          <div className="h-4 w-64 rounded bg-muted/40" />
        </div>
      </div>

      {/* Chat area skeleton */}
      <div className="glass-card rounded-2xl border border-primary/10 overflow-hidden min-h-[600px] flex">
        {/* Sidebar */}
        <div className="w-72 border-r border-border/20 p-3 space-y-2 shrink-0">
          <div className="h-10 rounded-xl bg-muted/40 mb-3" />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl">
              <div className="w-10 h-10 rounded-xl bg-muted/50 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 rounded bg-muted/50 w-3/4" />
                <div className="h-3 rounded bg-muted/40 w-full" />
              </div>
            </div>
          ))}
        </div>
        {/* Empty panel */}
        <div className="flex-1 hidden md:flex items-center justify-center">
          <div className="w-16 h-16 rounded-3xl bg-muted/30" />
        </div>
      </div>
    </div>
  );
}
