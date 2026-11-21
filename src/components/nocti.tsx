import Image from "next/image";

// Nocti, the CafeNoct mascot. Sleepy is the brand face (auth, loading, empty states); awake is the guide (tour, tips).
export type Mood = "sleepy" | "awake";

export default function Nocti({ mood = "sleepy", size = 96, className = "" }: { mood?: Mood; size?: number; className?: string }) {
  return (
    <Image
      src={`/nocti/${mood}.png`}
      alt={mood === "sleepy" ? "Nocti, dozing" : "Nocti, wide awake"}
      width={size}
      height={size}
      className={`nocti nocti-${mood} ${className}`}
      priority={size >= 120}
    />
  );
}
