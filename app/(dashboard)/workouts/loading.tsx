import { Loader2 } from "lucide-react";

export default function VideosLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Loading media...</p>
      </div>
    </div>
  );
}
