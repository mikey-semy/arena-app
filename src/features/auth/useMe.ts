import { useEffect, useState } from "react";

export type Clan = { tag: string; name: string; role: "leader" | "member" };

export type Me = {
  id: string;
  displayName: string;
  nick: string;
  avatarUrl: string | null;
  role: "player" | "admin";
  clan: Clan | null;
};

export type MeState = { status: "loading" } | { status: "guest" } | { status: "signed"; me: Me };

/** Кто сейчас вошёл. Единственный источник правды об этом на клиенте. */
export function useMe(): MeState {
  const [state, setState] = useState<MeState>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    fetch("/api/me")
      .then(async (response) => {
        if (!alive) return;
        if (response.status === 401) return setState({ status: "guest" });
        if (!response.ok) return setState({ status: "guest" });
        setState({ status: "signed", me: (await response.json()) as Me });
      })
      .catch(() => alive && setState({ status: "guest" }));
    return () => {
      alive = false;
    };
  }, []);

  return state;
}

export async function signOut(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
  location.href = "/";
}
