"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SowCard } from "@/components/sow-card";
import { ActivityTimeline } from "@/components/activity-timeline";
import { StatusBadge } from "@/components/status-badge";
import { ReviewCard } from "@/components/review-card";
import { Project } from "@/lib/types";

export default function ProjectPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [project, setProject] = useState<Project | null>(null);
  const [updateText, setUpdateText] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

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

  async function handleUpdate(markComplete = false) {
    if (!updateText && !markComplete) return;
    setLoading(true);
    await fetch("/api/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        message: markComplete
          ? updateText || "Project complete."
          : updateText,
        markComplete,
      }),
    });
    setUpdateText("");
    await fetchProject();
    setLoading(false);
  }

  function handleCopy() {
    if (!project) return;
    navigator.clipboard.writeText(
      `${window.location.origin}${project.clientUrl}`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading project...</p>
      </div>
    );
  }

  const pendingReviews = project.activityLog.filter(
    (e) => e.reviewStatus === "PENDING_REVIEW"
  );

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              Project Dashboard
            </h1>
            <p className="text-sm text-muted-foreground">
              {project.status === "PENDING"
                ? "Waiting for client approval"
                : project.status === "LOCKED"
                  ? "Client portal is live"
                  : project.status === "COMPLETED"
                    ? "Project complete"
                    : "Review SOW before sharing"}
            </p>
          </div>
          <div className="flex gap-2">
            <StatusBadge status={project.status} />
            {pendingReviews.length > 0 && (
              <Badge
                variant="outline"
                className="bg-yellow-950 text-yellow-500 border-yellow-800"
              >
                {pendingReviews.length} Review
                {pendingReviews.length > 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left: SOW */}
          <SowCard
            sowData={project.sowData}
            description="AI-generated from client notes"
          />

          {/* Right Column */}
          <div className="space-y-4">
            {/* Pending Reviews */}
            {pendingReviews.map((entry) => (
              <ReviewCard
                key={entry.id}
                entry={entry}
                projectId={projectId}
                onReviewed={fetchProject}
              />
            ))}

            {/* Post Update (only when LOCKED) */}
            {project.status === "LOCKED" && (
              <Card>
                <CardContent className="pt-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Post an update..."
                      value={updateText}
                      onChange={(e) => setUpdateText(e.target.value)}
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={loading || !updateText}
                      onClick={() => handleUpdate(false)}
                    >
                      Post
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full mt-2 border-blue-500 text-blue-500 hover:bg-blue-950"
                    disabled={loading}
                    onClick={() => handleUpdate(true)}
                  >
                    Mark Project Complete
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Timeline */}
            <ActivityTimeline entries={project.activityLog} />
          </div>
        </div>

        {/* Client Link Bar */}
        <Card className="mt-4">
          <CardContent className="py-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">
                Share with your client
              </p>
              <p className="text-sm font-mono text-blue-500">
                {typeof window !== "undefined"
                  ? `${window.location.origin}${project.clientUrl}`
                  : project.clientUrl}
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={handleCopy}>
              {copied ? "Copied!" : "Copy Link"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
