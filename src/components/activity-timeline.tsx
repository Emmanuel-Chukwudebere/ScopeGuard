import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActivityLogEntry } from "@/lib/types";

const typeBadge: Record<string, { label: string; className: string }> = {
  SYSTEM: {
    label: "SYSTEM",
    className: "bg-zinc-800 text-zinc-400 border-zinc-700",
  },
  FREELANCER_UPDATE: {
    label: "FREELANCER",
    className: "bg-violet-950 text-violet-400 border-violet-800",
  },
  CLIENT_REQUEST: {
    label: "CLIENT",
    className: "bg-blue-950 text-blue-400 border-blue-800",
  },
};

const verdictBadge: Record<string, { label: string; className: string }> = {
  IN_SCOPE: {
    label: "IN SCOPE",
    className: "bg-green-950 text-green-500 border-green-800",
  },
  GRAY_AREA: {
    label: "GRAY AREA",
    className: "bg-yellow-950 text-yellow-500 border-yellow-800",
  },
  OUT_OF_SCOPE: {
    label: "OUT OF SCOPE",
    className: "bg-red-950 text-red-500 border-red-800",
  },
};

export function ActivityTimeline({ entries }: { entries: ActivityLogEntry[] }) {
  const sorted = [...entries].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="border-l-2 border-border pl-4 space-y-4">
          {sorted.map((entry) => (
            <div key={entry.id}>
              <p className="text-xs text-muted-foreground">
                {new Date(entry.date).toLocaleString()}
              </p>
              <p className="text-sm text-foreground">{entry.message}</p>
              <div className="flex gap-1 mt-1 flex-wrap">
                <Badge
                  variant="outline"
                  className={typeBadge[entry.type]?.className}
                >
                  {typeBadge[entry.type]?.label}
                </Badge>
                {entry.scopeVerdict && (
                  <Badge
                    variant="outline"
                    className={verdictBadge[entry.scopeVerdict]?.className}
                  >
                    {verdictBadge[entry.scopeVerdict]?.label}
                  </Badge>
                )}
                {entry.reviewStatus === "PENDING_REVIEW" && (
                  <Badge
                    variant="outline"
                    className="bg-yellow-950 text-yellow-500 border-yellow-800"
                  >
                    AWAITING REVIEW
                  </Badge>
                )}
                {entry.reviewStatus === "APPROVED" && (
                  <Badge
                    variant="outline"
                    className="bg-green-950 text-green-500 border-green-800"
                  >
                    APPROVED
                  </Badge>
                )}
                {entry.reviewStatus === "SURCHARGE_PROPOSED" && (
                  <Badge
                    variant="outline"
                    className="bg-yellow-950 text-yellow-500 border-yellow-800"
                  >
                    SURCHARGE PROPOSED — +${entry.surcharge}
                  </Badge>
                )}
                {entry.reviewStatus === "REJECTED" && (
                  <Badge
                    variant="outline"
                    className="bg-red-950 text-red-500 border-red-800"
                  >
                    REJECTED
                  </Badge>
                )}
                {entry.surcharge && (
                  <Badge
                    variant="outline"
                    className="bg-yellow-950 text-yellow-500 border-yellow-800"
                  >
                    +${entry.surcharge}
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
