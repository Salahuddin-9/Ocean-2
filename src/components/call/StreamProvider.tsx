import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { StreamVideo, StreamVideoClient } from "@stream-io/video-react-sdk";
import "@stream-io/video-react-sdk/dist/css/styles.css";

export interface StreamUser {
  id: string;
  name: string;
  image?: string;
}

export const StreamVideoClientContext = createContext<StreamVideoClient | null>(null);

interface StreamProviderProps {
  user: StreamUser | null;
  token: string | null;
  children: ReactNode;
}

export default function StreamProvider({ user, token, children }: StreamProviderProps) {
  const [client, setClient] = useState<StreamVideoClient | null>(null);

  useEffect(() => {
    if (!user || !token) {
      setClient(null);
      return;
    }

    let mounted = true;

    async function initClient() {
      try {
        const res = await fetch("/api/stream/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ userId: user.id }),
        });
        if (!res.ok) {
          throw new Error(`Stream token request failed (${res.status})`);
        }
        const data = await res.json();

        // Fail-closed on an unconfigured Stream account: keep the client null
        // (the app then falls back to the built-in P2P call path) and NEVER
        // call getOrCreateInstance with undefined apiKey/token — that throws
        // and leaves the call buttons silently dead.
        if (data.configured === false || !data.apiKey || !data.token) {
          if (mounted) setClient(null);
          return;
        }

        const { token: streamToken, apiKey } = data;

        const safeImage = (user.image && !user.image.startsWith('data:') && user.image.length < 500)
          ? user.image
          : undefined;
        const safeName = (user.name && user.name.length <= 100)
          ? user.name
          : (user.name?.substring(0, 100) || user.id);

        let streamClient: StreamVideoClient | null = null;
        try {
          streamClient = StreamVideoClient.getOrCreateInstance({
            apiKey,
            user: { id: user.id, name: safeName, image: safeImage },
            token: streamToken,
          });

          // getOrCreateInstance returns a process-wide singleton CACHED by
          // (apiKey, user). When it returns a previously-created instance it
          // IGNORES the token arg — so if that instance was left disconnected
          // by an earlier unmount, reconnect it explicitly here. Without this,
          // every mount after the first gets a dead client and calls silently
          // stop working.
          if (!streamClient.state?.connectedUser) {
            await streamClient.connectUser(
              { id: user.id, name: safeName, image: safeImage },
              streamToken,
            );
          }
        } catch (err) {
          console.error("Stream client init error:", err);
          if (mounted) setClient(null);
          return;
        }

        if (mounted) setClient(streamClient);
      } catch (err) {
        console.error("Stream token request error:", err);
        if (mounted) setClient(null);
      }
    }

    initClient();

    // IMPORTANT: do NOT call disconnectUser() on unmount. The Stream client is
    // a cached singleton; disconnecting it here poisons the cache so the next
    // mount reuses a dead client and every later call fails. The client is only
    // torn down on explicit app-level logout instead.
    return () => {
      mounted = false;
    };
  }, [user?.id, token]);

  if (!client) {
    return (
      <StreamVideoClientContext.Provider value={null}>
        {children}
      </StreamVideoClientContext.Provider>
    );
  }

  return (
    <StreamVideoClientContext.Provider value={client}>
      <StreamVideo client={client}>{children}</StreamVideo>
    </StreamVideoClientContext.Provider>
  );
}

export function useStreamVideoClientSafe(): StreamVideoClient | null {
  return useContext(StreamVideoClientContext);
}
