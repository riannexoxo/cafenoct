import { isVideo } from "@/lib/posts";

// A post's image or video, cropped to fill its box. Videos show their first frame.
export default function MediaThumb({ src, className }: { src: string; className?: string }) {
  if (isVideo(src)) return <video className={className} src={`${src}#t=0.1`} muted playsInline preload="metadata" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={className} src={src} alt="" loading="lazy" />;
}
