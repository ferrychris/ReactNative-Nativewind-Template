import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useQueryClient } from "@tanstack/react-query";
import { unregisterPush } from "@/lib/push";
import { supabase } from "@/lib/supabase";
import { clearSignedUrlCache } from "@/lib/api/posts";
import type { Profile, UserType } from "@/lib/types";

WebBrowser.maybeCompleteAuthSession();

type AuthResult = { error: string | null };

type AuthContextValue = {
  session: Session | null;
  /** The signed-in user's row in `profiles` (source of truth). Null while loading or signed out. */
  profile: Profile | null;
  /** True until the first session + profile load finished. */
  loading: boolean;
  signInWithPassword: (identifier: string, password: string) => Promise<AuthResult>;
  signUp: (input: { email: string; password: string; name: string }) => Promise<AuthResult & { needsConfirmation?: boolean }>;
  signInWithGoogle: () => Promise<AuthResult>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function loadProfile(session: Session): Promise<Profile | null> {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
  if (error) throw error;
  if (data) return data as Profile;

  // Safety net: the on_auth_user_created trigger should have created this row already.
  const meta = session.user.user_metadata ?? {};
  const { data: created, error: insertError } = await supabase
    .from("profiles")
    .insert({
      id: session.user.id,
      email: session.user.email ?? `${session.user.id}@users.noreply.local`,
      name: meta.name ?? meta.full_name ?? "",
    })
    .select("*")
    .single();
  if (insertError) throw insertError;
  return created as Profile;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const hydrate = useCallback(async (next: Session | null) => {
    setSession(next);
    if (!next) {
      setProfile(null);
      return;
    }
    try {
      setProfile(await loadProfile(next));
    } catch {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => hydrate(data.session))
      .catch(() => {})
      .finally(() => active && setLoading(false)); // never leave the splash stuck if this fails
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      // Don't await Supabase calls inside this callback (deadlock risk); defer.
      setTimeout(() => {
        hydrate(next).finally(() => active && setLoading(false));
      }, 0);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [hydrate]);

  const refreshProfile = useCallback(async () => {
    if (session) setProfile(await loadProfile(session));
  }, [session]);

  const signInWithPassword = useCallback(async (identifier: string, password: string): Promise<AuthResult> => {
    // "@apex_hunter" is a username; "a@b.com" is an email
    const id = identifier.trim().replace(/^@(?=[^@]*$)/, "");
    let email = id.toLowerCase();

    // Emails sign in directly. Only usernames need the lookup function.
    if (!id.includes("@")) {
      const { data, error: lookupError } = await supabase.rpc("resolve_login_email", { p_identifier: id });
      if (lookupError) {
        // PGRST202 / 42883: the function doesn't exist yet (migration 20261002100700 not applied)
        const missing = lookupError.code === "PGRST202" || lookupError.code === "42883";
        return {
          error: missing
            ? "Username login isn't set up on the server yet. Log in with your email for now."
            : `Couldn't reach the server (${lookupError.message}).`,
        };
      }
      if (!data) return { error: "Incorrect username/email or password." };
      email = data as string;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) return { error: null };
    if (error.message.toLowerCase().includes("email not confirmed")) return { error: "Confirm your email first. Check your inbox for the link." };
    if (error.message.toLowerCase().includes("invalid login")) return { error: "Incorrect username/email or password." };
    return { error: error.message };
  }, []);

  const signUp = useCallback<AuthContextValue["signUp"]>(async ({ email, password, name }) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { name: name.trim() } },
    });
    if (error) return { error: error.message };
    return { error: null, needsConfirmation: !data.session };
  }, []);

  const signInWithGoogle = useCallback(async (): Promise<AuthResult> => {
    // Requires the redirect URL below to be allow-listed in Supabase Auth settings
    // and the Google provider to be enabled.
    const redirectTo = Linking.createURL("auth/callback");
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error || !data.url) return { error: error?.message ?? "Google sign-in is unavailable." };

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== "success") return { error: null }; // cancelled

    const params = new URLSearchParams(result.url.split("#")[1] ?? result.url.split("?")[1] ?? "");
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    if (!access_token || !refresh_token) return { error: "Google sign-in didn't complete." };
    const { error: sessionError } = await supabase.auth.setSession({ access_token, refresh_token });
    return { error: sessionError?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    await unregisterPush(); // needs the session, so before signing out: this phone stops getting your notifications
    await supabase.auth.signOut();
    clearSignedUrlCache();
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo(
    () => ({ session, profile, loading, signInWithPassword, signUp, signInWithGoogle, signOut, refreshProfile }),
    [session, profile, loading, signInWithPassword, signUp, signInWithGoogle, signOut, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
