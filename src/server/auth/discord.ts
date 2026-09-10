// Вход через Discord.
//
// Почему Discord, а не своя пара «почта и пароль»: аудитория Quake и так там
// живёт, а своя регистрация тянет за собой хранение паролей, подтверждение
// почты, восстановление доступа, защиту от перебора и почтовый сервер, письма
// которого не улетают в спам. Всего этого у нас просто не будет.
const AUTHORIZE = "https://discord.com/oauth2/authorize";
const TOKEN = "https://discord.com/api/oauth2/token";
const ME = "https://discord.com/api/users/@me";

export type DiscordUser = {
  id: string;
  username: string;
  globalName: string | undefined;
  avatarUrl: string | undefined;
};

export type DiscordConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export function authorizeUrl(config: DiscordConfig, state: string): string {
  const url = new URL(AUTHORIZE);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "identify");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeCode(config: DiscordConfig, code: string): Promise<DiscordUser> {
  const response = await fetch(TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
    }),
  });
  if (!response.ok) throw new Error(`Discord не отдал токен: ${response.status}`);

  const token = (await response.json()) as { access_token?: string };
  if (!token.access_token) throw new Error("Discord не вернул access_token");

  const profile = await fetch(ME, {
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  if (!profile.ok) throw new Error(`Discord не отдал профиль: ${profile.status}`);

  const me = (await profile.json()) as {
    id: string;
    username: string;
    global_name?: string | null;
    avatar?: string | null;
  };

  return {
    id: me.id,
    username: me.username,
    globalName: me.global_name ?? undefined,
    avatarUrl: me.avatar
      ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png`
      : undefined,
  };
}
