import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getProject, saveProject } from "@/lib/redis";

export async function POST(request: Request) {
  const { projectId } = await request.json();
  const project = await getProject(projectId);

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (project.status !== "DRAFT") {
    return NextResponse.json(
      { error: "Project already shared" },
      { status: 400 }
    );
  }

  project.status = "PENDING";
  project.activityLog.push({
    id: nanoid(8),
    date: new Date().toISOString(),
    type: "SYSTEM",
    message: "Project shared. Awaiting client approval.",
    scopeVerdict: null,
    reviewStatus: null,
    surcharge: null,
    aiReasoning: null,
  });

  await saveProject(project);
  return NextResponse.json(project);
}
