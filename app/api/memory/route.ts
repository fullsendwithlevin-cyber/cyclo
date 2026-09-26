import { api, parseBody } from "@/lib/http/api";
import { listMemories, memoryInputSchema, storeMemory } from "@/lib/memory/service";

export const GET = api(async ({ user }) => ({ memories: await listMemories(user.id) }));
export const POST = api(async ({ req, user }) => storeMemory(user.id, { ...(await parseBody(req, memoryInputSchema.omit({ source: true, sourceRef: true }))), source: "user" }));
