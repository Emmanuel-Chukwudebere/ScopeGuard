import { Redis } from "@upstash/redis";
import { Project } from "./types";

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export async function getProject(projectId: string) {
  return redis.get<Project>(`project:${projectId}`);
}

export async function saveProject(project: Project) {
  await redis.set(`project:${project.projectId}`, project);
  return project;
}
