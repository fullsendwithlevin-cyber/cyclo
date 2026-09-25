import { api, parseBody } from "@/lib/http/api";
import { createReminder, listReminders, reminderInputSchema } from "@/lib/reminders/service";

export const GET = api(async ({ user }) => ({ reminders: await listReminders(user.id) }));
export const POST = api(async ({ req, user }) => ({ reminder: await createReminder(user.id, await parseBody(req, reminderInputSchema)) }));
