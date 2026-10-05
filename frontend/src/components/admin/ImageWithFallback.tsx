import { useState, type ImgHTMLAttributes } from "react";

type ImageWithFallbackProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "src" | "onError"
> & {
  src?: string | null;
  fallbackSrc: string;
};

export default function ImageWithFallback({
  src,
  fallbackSrc,
  ...imageProps
}: ImageWithFallbackProps) {
  const [failedImage, setFailedImage] = useState<{
    src: string | null | undefined;
    fallbackSrc: string;
  } | null>(null);
  const alreadyFailed =
    failedImage !== null &&
    failedImage.src === src &&
    failedImage.fallbackSrc === fallbackSrc;
  const imageSrc = src && !alreadyFailed ? src : fallbackSrc;

  return (
    <img
      {...imageProps}
      src={imageSrc}
      onError={() => {
        if (imageSrc !== fallbackSrc) setFailedImage({ src, fallbackSrc });
      }}
    />
  );
}
