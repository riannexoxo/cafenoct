import LoginForm from "./login-form";

export const metadata = { title: "Sign in" };

const NOTICES: Record<string, string> = {
  link: "That link has expired or was already used. Ask for a new one below.",
  reset: "Your password is updated. Sign in with the new one.",
  signedout: "You're signed out. See you soon.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ invite?: string; notice?: string }> }) {
  const { invite, notice } = await searchParams;
  return <LoginForm invite={(invite ?? "").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 40)} notice={NOTICES[notice ?? ""] ?? ""} />;
}
