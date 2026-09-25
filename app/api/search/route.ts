import { api } from "@/lib/http/api";
import { globalSearch, SEARCH_KINDS, type SearchKind } from "@/lib/search/global";

export const GET = api(async ({ user, req }) => {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const kinds = (sp.get("kinds") ?? "").split(",").filter((k): k is SearchKind => SEARCH_KINDS.some((s) => s.kind === k));
  return globalSearch(user.id, q, { timezone: user.timezone, kinds, live: sp.get("live") !== "0" });
});
