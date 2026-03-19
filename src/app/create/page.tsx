"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SowCard } from "@/components/sow-card";
import { Project } from "@/lib/types";

export default function CreatePage() {
  const router = useRouter();
  const [freelancerName, setFreelancerName] = useState("");
  const [clientNotes, setClientNotes] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [raenestLink, setRaenestLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState("");

  async function handleGenerate() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/generate-sow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          freelancerName,
          clientNotes,
          basePrice: Number(basePrice),
          raenestLink,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to generate SOW");
      }
      const data = await res.json();
      setProject(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleShare() {
    if (!project) return;
    setLoading(true);
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.projectId }),
      });
      if (!res.ok) throw new Error("Failed to share project");
      router.push(project.freelancerUrl);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold tracking-tight">ScopeGuard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Eliminate scope creep. Get paid.
          </p>
        </div>

        {!project ? (
          <Card>
            <CardHeader>
              <CardTitle>New Project</CardTitle>
              <CardDescription>
                Paste your client notes and we&apos;ll generate a professional
                SOW.
              </CardDescription>
            </CardHeader>
            <Separator />
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Your Name</Label>
                <Input
                  id="name"
                  placeholder="Emmanuel"
                  value={freelancerName}
                  onChange={(e) => setFreelancerName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Client Notes / Chat History</Label>
                <Textarea
                  id="notes"
                  placeholder="Paste your client conversation, project brief, or requirements here..."
                  className="min-h-[120px]"
                  value={clientNotes}
                  onChange={(e) => setClientNotes(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="price">Base Price ($)</Label>
                  <Input
                    id="price"
                    type="number"
                    placeholder="500"
                    value={basePrice}
                    onChange={(e) => setBasePrice(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="raenest">Raenest Payment Link</Label>
                  <Input
                    id="raenest"
                    placeholder="https://pay.raenest.com/..."
                    value={raenestLink}
                    onChange={(e) => setRaenestLink(e.target.value)}
                  />
                </div>
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button
                className="w-full"
                onClick={handleGenerate}
                disabled={
                  loading ||
                  !freelancerName ||
                  !clientNotes ||
                  !basePrice ||
                  !raenestLink
                }
              >
                {loading ? "Generating..." : "Generate SOW with AI"}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <SowCard
              sowData={project.sowData}
              description="AI-generated from your client notes. Review before sharing."
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button className="w-full" onClick={handleShare} disabled={loading}>
              {loading ? "Sharing..." : "Generate Client Portal Link"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
