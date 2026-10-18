import { clientLabel, type Client } from "@/lib/types";

// The client's logo when they have one, otherwise their first letter on their color.
export default function ClientAvatar({ c, size, className = "avatar" }: { c: Pick<Client, "name" | "company" | "color" | "logo_url">; size?: number; className?: string }) {
  const style: React.CSSProperties = size ? { width: size, height: size, fontSize: Math.round(size * 0.4), borderRadius: Math.round(size * 0.34) } : {};
  if (c.logo_url) return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={c.logo_url} alt="" className={`${className} has-logo`} style={style} />
  );
  return <span className={className} style={{ ...style, background: c.color }} aria-hidden="true">{clientLabel(c)[0]?.toUpperCase()}</span>;
}
