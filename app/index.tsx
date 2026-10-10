import { Redirect } from "expo-router";

// AuthGate in _layout.tsx sends signed-out users to /auth/login.
export default function Index() {
  return <Redirect href="/dashboard" />;
}
