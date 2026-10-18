import { brand } from "@/brand";
import LoginForm from "./login-form";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="auth-page">
      <div className="auth-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={brand.logo} alt="" className="auth-logo" />
        <h1>{brand.name}</h1>
        <p className="muted">{brand.tagline}</p>
        <LoginForm />
      </div>
    </main>
  );
}
