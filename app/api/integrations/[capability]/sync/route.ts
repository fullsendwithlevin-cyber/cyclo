import { AppError } from "@/lib/errors";
import { api } from "@/lib/http/api";
import { syncGmail } from "@/lib/integrations/google/sync";
import { syncOneNote } from "@/lib/integrations/microsoft/sync";
import { syncSchool } from "@/lib/integrations/school/sync";

export const runtime = "nodejs";
export const maxDuration = 300;

export const POST = api<{ capability: string }>(async ({ user, params }) => {
  switch (params.capability) {
    case "gmail":
      return { result: await syncGmail(user.id) };
    case "onenote":
      return { result: await syncOneNote(user.id) };
    case "school":
      return { result: await syncSchool(user.id) };
    default:
      throw new AppError({ code: "UNSUPPORTED", action: "Synchronisieren", reason: "Für diese Integration gibt es keinen manuellen Abgleich." });
  }
});
