// The painted illustrations, served as WebP at a few widths so phones download small files.
// The files and their sizes come from scripts/prepare_illustrations.py.
import { illustrationFiles, type IllustrationName } from "./illustrationFiles";

export function Illustration({
  name,
  alt,
  sizes,
  priority = false,
  className,
}: {
  name: IllustrationName;
  /** Empty when the picture only decorates text that already says the same thing. */
  alt: string;
  /** How wide the picture is shown, so the browser picks the right file. */
  sizes: string;
  /** True for the first picture on a page, so it loads straight away. */
  priority?: boolean;
  className?: string;
}) {
  const f = illustrationFiles[name];
  const largest = f.widths[f.widths.length - 1];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/illustrations/${name}_${largest}.webp`}
      srcSet={f.widths.map((w) => `/illustrations/${name}_${w}.webp ${w}w`).join(", ")}
      sizes={sizes}
      width={f.width}
      height={f.height}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      className={className ?? "h-auto w-full"}
    />
  );
}
