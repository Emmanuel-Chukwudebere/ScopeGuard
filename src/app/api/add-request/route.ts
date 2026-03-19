import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getProject, saveProject } from "@/lib/redis";
import { ScopeVerdict } from "@/lib/types";

export async function POST(request: Request) {
  const { projectId, requestText, verdict, reasoning, estimatedSurcharge } =
    await request.json();
  const project = await getProject(projectId);

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  project.activityLog.push({
    id: nanoid(8),
    date: new Date().toISOString(),
    type: "CLIENT_REQUEST",
    message: requestText,
    scopeVerdict: verdict as ScopeVerdict,
    reviewStatus: verdict === "IN_SCOPE" ? null : "PENDING_REVIEW",
    surcharge: estimatedSurcharge ?? null,
    aiReasoning: reasoning,
  });

  await saveProject(project);
  return NextResponse.json(project);
}
