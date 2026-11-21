import Link from "next/link";
import Nocti from "@/components/nocti";

// A whole-page "nothing here" moment: sleepy Nocti, one line, one way forward.
export default function CalmEmpty({ title, line, href, action, children }: { title: string; line: string; href?: string; action?: string; children?: React.ReactNode }) {
  return (
    <div className="pt-calm">
      <Nocti size={96} />
      <h1>{title}</h1>
      <p className="muted">{line}</p>
      {href && action ? <Link className="btn solid big" href={href}>{action}</Link> : children}
    </div>
  );
}
