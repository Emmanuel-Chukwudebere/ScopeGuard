"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ActivityLogEntry } from "@/lib/types";

export function ReviewCard({
  entry,
  projectId,
  onReviewed,
}: {
  entry: ActivityLogEntry;
  projectId: string;
  onReviewed: () => void;
}) {
  const [surchargeAmount, setSurchargeAmount] = useState("");
  const [showSurcharge, setShowSurcharge] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleReview(
    action: "APPROVED" | "REJECTED" | "SURCHARGE_PROPOSED",
    surcharge?: number
  ) {
    setLoading(true);
    await fetch("/api/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        logEntryId: entry.id,
        action,
        surcharge: surcharge ?? null,
      }),
    });
    setLoading(false);
    onReviewed();
  }

  return (
    <div className="border border-yellow-800 bg-yellow-950 rounded-lg p-4">
      <div className="flex items-start justify-between mb-2">
        <p className="text-sm font-semibold text-yellow-500">
          Needs Your Review
        </p>
        <Badge
          variant="outline"
          className="bg-zinc-800 text-zinc-400 border-zinc-700"
        >
          {entry.scopeVerdict === "OUT_OF_SCOPE" ? "OUT OF SCOPE" : "GRAY AREA"}
        </Badge>
      </div>
      <p className="text-sm text-foreground mb-1">
        &ldquo;{entry.message}&rdquo;
      </p>
      {entry.aiReasoning && (
        <p className="text-xs text-muted-foreground mb-3">
          AI: {entry.aiReasoning}
        </p>
      )}
      {showSurcharge ? (
        <div className="flex gap-2">
          <Input
            type="number"
            placeholder="Surcharge $"
            value={surchargeAmount}
            onChange={(e) => setSurchargeAmount(e.target.value)}
            className="w-32"
          />
          <Button
            size="sm"
            disabled={loading || !surchargeAmount}
            onClick={() =>
              handleReview("SURCHARGE_PROPOSED", Number(surchargeAmount))
            }
          >
            Propose
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowSurcharge(false)}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={loading}
            onClick={() => handleReview("APPROVED")}
          >
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={loading}
            onClick={() => setShowSurcharge(true)}
          >
            + Surcharge
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={loading}
            onClick={() => handleReview("REJECTED")}
          >
            Reject
          </Button>
        </div>
      )}
    </div>
  );
}
