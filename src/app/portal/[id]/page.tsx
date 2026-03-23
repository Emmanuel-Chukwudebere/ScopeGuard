"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SowCard } from "@/components/sow-card";
import { ActivityTimeline } from "@/components/activity-timeline";
import { StatusBadge } from "@/components/status-badge";
import { Project, getTotalPrice } from "@/lib/types";

export default function PortalPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [project, setProject] = useState<Project | null>(null);
  const [requestText, setRequestText] = useState("");
  const [loading, setLoading] = useState(false);
  const [scopeDialog, setScopeDialog] = useState<{
    open: boolean;
    verdict: string;
    reasoning: string;
    estimatedSurcharge: number | null;
    requestText: string;
  }>({
    open: false,
    verdict: "",
    reasoning: "",
    estimatedSurcharge: null,
    requestText: "",
  });

  async function saveRequest(
    text: string,
    verdict: string,
    reasoning: string,
    estimatedSurcharge: number | null
  ) {
    await fetch("/api/add-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        requestText: text,
        verdict,
        reasoning,
        estimatedSurcharge,
      }),
    });
    await fetchProject();
  }

  const fetchProject = useCallback(async () => {
    const res = await fetch(`/api/project/${projectId}`);
    if (res.ok) {
      setProject(await res.json());
    }
  }, [projectId]);

  useEffect(() => {
    fetchProject();
    const interval = setInterval(fetchProject, 10000);
    return () => clearInterval(interval);
  }, [fetchProject]);

  async function handleApprove() {
    setLoading(true);
    await fetch("/api/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    await fetchProject();
    setLoading(false);
  }

  async function handleSubmitRequest() {
    if (!requestText) return;
    setLoading(true);
    const res = await fetch("/api/check-scope", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, requestText }),
    });
    const data = await res.json();

    if (data.verdict === "IN_SCOPE") {
      await saveRequest(requestText, data.verdict, data.reasoning, null);
    } else if (data.verdict === "GRAY_AREA") {
      await saveRequest(requestText, data.verdict, data.reasoning, null);
    } else if (data.verdict === "OUT_OF_SCOPE") {
      setScopeDialog({
        open: true,
        verdict: data.verdict,
        reasoning: data.reasoning,
        estimatedSurcharge: data.estimatedSurcharge,
        requestText,
      });
    }

    setRequestText("");
    setLoading(false);
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading project...</p>
      </div>
    );
  }

  const totalPrice = getTotalPrice(project);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Your Project</h1>
            <p className="text-sm text-muted-foreground">
              Managed by {project.freelancerName}
            </p>
          </div>
          <StatusBadge status={project.status} />
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left: SOW */}
          <SowCard
            sowData={project.sowData}
            description={
              project.status === "PENDING"
                ? "Review and approve to lock scope"
                : "Approved and locked"
            }
          />

          {/* Right Column */}
          <div className="space-y-4">
            {/* Approve Button (PENDING) */}
            {project.status === "PENDING" && (
              <Button
                className="w-full"
                size="lg"
                disabled={loading}
                onClick={handleApprove}
              >
                {loading ? "Approving..." : "Approve SOW & Lock Scope"}
              </Button>
            )}

            {/* Submit Request (LOCKED) */}
            {project.status === "LOCKED" && (
              <Card>
                <CardContent className="pt-4">
                  <p className="text-sm font-medium mb-2">Submit a Request</p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Describe what you need..."
                      value={requestText}
                      onChange={(e) => setRequestText(e.target.value)}
                    />
                    <Button
                      size="sm"
                      disabled={loading || !requestText}
                      onClick={handleSubmitRequest}
                    >
                      {loading ? "..." : "Submit"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Requests are checked against the locked scope by AI.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Timeline */}
            <ActivityTimeline entries={project.activityLog} />
          </div>
        </div>

        {/* Payment Button (COMPLETED) */}
        {project.status === "COMPLETED" ? (
          <a
            href={project.raenestLink}
            target="_blank"
            rel="noopener noreferrer"
            className="block mt-4"
          >
            <Button
              className="w-full bg-green-600 hover:bg-green-700 text-white"
              size="lg"
            >
              Release Payment via Raenest — ${totalPrice}
            </Button>
          </a>
        ) : (
          <div className="mt-4 border border-green-800 bg-green-950 rounded-lg p-5 text-center opacity-40">
            <p className="text-base font-bold text-green-500">
              Release Payment via Raenest — ${totalPrice}
            </p>
            <p className="text-xs text-green-400 mt-1 opacity-70">
              Activates when project is marked complete
            </p>
          </div>
        )}
      </div>

      {/* Out-of-Scope Alert Dialog */}
      <AlertDialog
        open={scopeDialog.open}
        onOpenChange={(open) =>
          setScopeDialog((prev) => ({ ...prev, open }))
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Out of Scope</AlertDialogTitle>
            <AlertDialogDescription>
              This request falls outside the agreed scope of work.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="bg-muted rounded-lg p-4 my-2">
            <p className="text-sm text-foreground mb-2">
              &ldquo;{scopeDialog.requestText}&rdquo;
            </p>
            <p className="text-xs text-muted-foreground">
              {scopeDialog.reasoning}
            </p>
          </div>
          {scopeDialog.estimatedSurcharge && (
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-muted-foreground">
                Estimated surcharge
              </span>
              <span className="text-lg font-bold text-yellow-500">
                +${scopeDialog.estimatedSurcharge}
              </span>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Withdraw</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const { requestText: text, verdict, reasoning, estimatedSurcharge } = scopeDialog;
                setScopeDialog((prev) => ({ ...prev, open: false }));
                saveRequest(text, verdict, reasoning, estimatedSurcharge);
              }}
            >
              Request Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
