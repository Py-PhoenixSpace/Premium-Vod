export const dynamic = "force-dynamic";

import { Loader2 } from "lucide-react";

export default function SuperAdminLoading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-10 h-10 text-accent animate-spin" />
        <p className="text-sm text-muted-foreground">Loading super-admin panel...</p>
      </div>
    </div>
  );
}
