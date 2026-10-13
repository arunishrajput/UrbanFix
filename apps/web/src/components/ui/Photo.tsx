import { useState } from 'react';
import { cn } from '../../lib/cn';
import { thumbhashUrl } from '../../lib/thumbhash';

/** Image with a blurred thumbhash placeholder that cross-fades when loaded. */
export function Photo({
  src,
  thumbhash,
  alt,
  className,
  imgClassName,
  loading = 'lazy',
}: {
  src: string;
  thumbhash?: string | null;
  alt: string;
  className?: string;
  imgClassName?: string;
  loading?: 'lazy' | 'eager';
}) {
  const [loaded, setLoaded] = useState(false);
  const placeholder = thumbhashUrl(thumbhash);
  return (
    <div
      className={cn('relative overflow-hidden bg-surface-2', className)}
      style={
        placeholder
          ? { backgroundImage: `url(${placeholder})`, backgroundSize: 'cover', backgroundPosition: 'center' }
          : undefined
      }
    >
      <img
        src={src}
        alt={alt}
        loading={loading}
        decoding="async"
        onLoad={() => setLoaded(true)}
        className={cn(
          'size-full object-cover transition-opacity duration-500',
          loaded ? 'opacity-100' : 'opacity-0',
          imgClassName,
        )}
      />
    </div>
  );
}
