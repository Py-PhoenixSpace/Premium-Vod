export default function SkeletonCard() {
  return (
    <div className="glass-card rounded-2xl overflow-hidden animate-pulse bg-card/40">
      {/* Thumbnail */}
      <div className="aspect-video bg-muted/40 relative overflow-hidden">
        <div className="absolute bottom-2 right-2 h-5 w-12 bg-muted/60 rounded-lg" />
        <div className="absolute bottom-2 left-2 h-5 w-16 bg-muted/50 rounded-lg" />
      </div>
      {/* Info */}
      <div className="p-4 space-y-2.5">
        <div className="h-4 bg-muted/50 rounded-lg w-3/4" />
        <div className="h-3 bg-muted/30 rounded-lg w-full" />
        <div className="h-3 bg-muted/30 rounded-lg w-4/5" />
        <div className="pt-2 border-t border-border/20 flex items-center justify-between">
          <div className="h-3 bg-muted/30 rounded-lg w-14" />
          <div className="h-3 bg-muted/40 rounded-lg w-16" />
        </div>
      </div>
    </div>
  );
}
