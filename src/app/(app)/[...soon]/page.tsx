import Icon from "@/components/icon";

// Sections still being moved over from the Mac app show this until they're rebuilt here.
export default function Soon() {
  return (
    <div className="card soon">
      <Icon name="spark" size={28} />
      <b style={{ color: "var(--ink)", fontWeight: 500 }}>This section is being moved over</b>
      <span>It works in the CafeNoct Mac app today and will appear here in the next build.</span>
    </div>
  );
}
