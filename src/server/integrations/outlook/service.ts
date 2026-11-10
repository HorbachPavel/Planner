import {
  CryptoProvider,
  PublicClientApplication,
  type Configuration,
  type ICachePlugin,
} from "@azure/msal-node";
import { db } from "@/db";
import { outlookEvents } from "@/db/schema";
import { getSecret, getSetting, setSecret } from "@/server/config";

const scopes = ["Calendars.Read", "offline_access", "User.Read"];
export const redirectUri =
  process.env.MICROSOFT_REDIRECT_URI ?? "http://localhost:3000/api/outlook/callback";

async function getApp() {
  const clientId = await getSetting("microsoftClientId");
  const tenantId = (await getSetting("microsoftTenantId")) ?? "common";
  if (!clientId) throw new Error("Add a Microsoft Client ID in Settings first.");
  const cachePlugin: ICachePlugin = {
    beforeCacheAccess: async (context) => {
      const cache = await getSecret("microsoft-token-cache");
      if (cache) context.tokenCache.deserialize(cache);
    },
    afterCacheAccess: async (context) => {
      if (context.cacheHasChanged) {
        await setSecret("microsoft-token-cache", context.tokenCache.serialize());
      }
    },
  };
  const config: Configuration = {
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
    },
    cache: { cachePlugin },
  };
  return new PublicClientApplication(config);
}

export async function createAuthRequest() {
  const app = await getApp();
  const cryptoProvider = new CryptoProvider();
  const { verifier, challenge } = await cryptoProvider.generatePkceCodes();
  const state = crypto.randomUUID();
  const url = await app.getAuthCodeUrl({
    scopes,
    redirectUri,
    codeChallenge: challenge,
    codeChallengeMethod: "S256",
    state,
    prompt: "select_account",
  });
  return { url, verifier, state };
}

export async function finishAuth(code: string, verifier: string) {
  const app = await getApp();
  return app.acquireTokenByCode({
    code,
    scopes,
    redirectUri,
    codeVerifier: verifier,
  });
}

export async function syncOutlookEvents() {
  const app = await getApp();
  const accounts = await app.getTokenCache().getAllAccounts();
  if (!accounts[0]) throw new Error("Outlook is not connected. Connect Outlook first.");
  const token = await app.acquireTokenSilent({ account: accounts[0], scopes });
  const start = new Date();
  start.setDate(start.getDate() - 7);
  const end = new Date();
  end.setDate(end.getDate() + 60);
  const query = new URLSearchParams({
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
    $select: "id,subject,start,end,isAllDay,showAs,webLink",
    $orderby: "start/dateTime",
    $top: "500",
  });
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/me/calendarView?${query}`,
    {
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        Prefer: 'outlook.timezone="UTC"',
      },
    },
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Microsoft Graph returned ${response.status}: ${detail.slice(0, 200)}`);
  }
  const body = (await response.json()) as { value: GraphEvent[] };
  const syncedAt = new Date();
  await db.transaction(async (tx) => {
    await tx.delete(outlookEvents);
    if (body.value.length) {
      await tx.insert(outlookEvents).values(
        body.value.map((event) => ({
          id: event.id,
          subject: event.subject || "Busy",
          startsAt: new Date(`${event.start.dateTime}Z`),
          endsAt: new Date(`${event.end.dateTime}Z`),
          isAllDay: event.isAllDay,
          showAs: event.showAs ?? "busy",
          webLink: event.webLink ?? null,
          syncedAt,
        })),
      );
    }
  });
  return body.value.length;
}

type GraphEvent = {
  id: string;
  subject?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  isAllDay: boolean;
  showAs?: string;
  webLink?: string;
};
