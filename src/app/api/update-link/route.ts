import { NextResponse } from "next/server";
import { getProject, saveProject } from "@/lib/redis";

export async function POST(request: Request) {
  const { projectId, raenestLink } = await request.json();
  const project = await getProject(projectId);

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  project.raenestLink = raenestLink;
  await saveProject(project);
  return NextResponse.json(project);
}
