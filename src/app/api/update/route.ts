import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getProject, saveProject } from "@/lib/redis";

export async function POST(request: Request) {
  const { projectId, message, markComplete } = await request.json();
  const project = await getProject(projectId);

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (project.status !== "LOCKED") {
    return NextResponse.json(
      { error: "Project is not in active state" },
      { status: 400 }
    );
  }

  project.activityLog.push({
    id: nanoid(8),
    date: new Date().toISOString(),
    type: "FREELANCER_UPDATE",
    message,
    scopeVerdict: null,
    reviewStatus: null,
    surcharge: null,
    aiReasoning: null,
  });

  if (markComplete) {
    project.status = "COMPLETED";
    project.activityLog.push({
      id: nanoid(8),
      date: new Date().toISOString(),
      type: "SYSTEM",
      message: "Project marked as complete.",
      scopeVerdict: null,
      reviewStatus: null,
      surcharge: null,
      aiReasoning: null,
    });
  }

  await saveProject(project);
  return NextResponse.json(project);
}
