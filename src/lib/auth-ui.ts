// Shared bits for the sign-in, sign-up and password pages: friendly errors and a password strength check.

// Turns Supabase auth errors into plain, kind messages. Never shows raw internals.
export function friendlyAuthError(err: { message?: string; status?: number; code?: string } | null | undefined, kind: "signin" | "email" | "password" = "signin"): string {
  if (!err) return "";
  const m = `${err.code ?? ""} ${err.message ?? ""}`.toLowerCase();
  if (err.status === 429 || /rate limit|too many|over_email_send_rate_limit|over_request_rate_limit/.test(m)) {
    return kind === "email"
      ? "We've sent the most emails we can for now (Supabase allows 2 an hour). Please try again in a little while."
      : "Too many tries in a short time. Take a breath and try again in a few minutes.";
  }
  if (/captcha/.test(m)) return "Please finish the quick check below, then try again.";
  if (/invalid login|invalid_credentials/.test(m)) return "That email and password don't match.";
  if (/email not confirmed/.test(m)) return "Please confirm your email first, then sign in.";
  if (/same_password|should be different/.test(m)) return "Pick a password you haven't used here before.";
  if (/weak_password|password should|pwned|leaked/.test(m)) return "That password is too easy to guess. Try a longer one, like a short sentence.";
  if (/session|jwt|expired|otp/.test(m)) return "That link has expired or was already used. Ask for a new one.";
  if (/fetch|network|failed to fetch/.test(m)) return "Check your connection and try again.";
  return "Something went wrong. Please try again.";
}

// A gentle strength check: length matters most. Returns 0 (empty) to 4 (strong).
const COMMON = ["password", "123456", "qwerty", "letmein", "welcome", "iloveyou", "admin", "cafenoct", "abc123", "111111"];
export function passwordStrength(pw: string, email = ""): { score: 0 | 1 | 2 | 3 | 4; label: string; hint: string } {
  if (!pw) return { score: 0, label: "", hint: "At least 10 characters. A short sentence works great." };
  const lower = pw.toLowerCase(), local = email.split("@")[0]?.toLowerCase() ?? "";
  if (pw.length < 10) return { score: 1, label: "Too short", hint: `${10 - pw.length} more character${pw.length === 9 ? "" : "s"} to go.` };
  if (COMMON.some((c) => lower.includes(c)) || (local.length >= 3 && lower.includes(local))) return { score: 1, label: "Easy to guess", hint: "Avoid your email or common words." };
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  const score = (pw.length >= 16 || (pw.length >= 12 && kinds >= 3) ? 4 : pw.length >= 12 || kinds >= 3 ? 3 : 2) as 2 | 3 | 4;
  return { score, label: ["", "", "Okay", "Strong", "Very strong"][score], hint: score < 3 ? "Longer is stronger. Add a word or two." : "Lovely. Keep it somewhere safe." };
}

// Server and client agree on the rules for new passwords.
export function newPasswordProblem(pw: string, email = ""): string {
  if (pw.length < 10) return "Use at least 10 characters.";
  if (pw.length > 72) return "Use 72 characters or fewer.";
  if (email && pw.toLowerCase() === email.toLowerCase()) return "Your password can't be your email.";
  return "";
}

// Only same-site paths are allowed as a place to land after a link (no open redirects).
export function safeNext(next: string | null | undefined, fallback = "/") {
  return next && /^\/(?!\/)[\w\-/?=&.%]*$/.test(next) && !next.startsWith("/\\") ? next : fallback;
}
