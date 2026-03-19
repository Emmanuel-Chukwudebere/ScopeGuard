import { Badge } from "@/components/ui/badge";
import { ProjectStatus } from "@/lib/types";

const statusConfig: Record<
  ProjectStatus,
  { label: string; className: string }
> = {
  DRAFT: {
    label: "DRAFT",
    className: "bg-zinc-800 text-zinc-400 border-zinc-700",
  },
  PENDING: {
    label: "PENDING",
    className: "bg-yellow-950 text-yellow-500 border-yellow-800",
  },
  LOCKED: {
    label: "LOCKED",
    className: "bg-green-950 text-green-500 border-green-800",
  },
  COMPLETED: {
    label: "COMPLETED",
    className: "bg-blue-950 text-blue-500 border-blue-800",
  },
};

export function StatusBadge({ status }: { status: ProjectStatus }) {
  const config = statusConfig[status];
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}
