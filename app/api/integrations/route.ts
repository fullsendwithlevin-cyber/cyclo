import { api } from "@/lib/http/api";
import { isOAuthProviderConfigured } from "@/lib/auth/oauth";
import { CAPABILITIES } from "@/lib/integrations/catalog";
import { getCapabilityStatus } from "@/lib/tools/registry";

export const GET = api(async ({ user }) => {
  const status = await getCapabilityStatus(user.id);
  return {
    integrations: status.map((s) => {
      const def = CAPABILITIES.find((c) => c.id === s.id)!;
      const oauthProvider = def.provider === "GOOGLE" ? "google" : def.provider === "MICROSOFT" ? "microsoft" : null;
      return {
        ...s,
        description: def.description,
        connect: def.connect,
        provider: def.provider,
        serverConfigured: oauthProvider ? isOAuthProviderConfigured(oauthProvider) : def.connect === "server-key" ? s.connected : true,
      };
    }),
  };
});
