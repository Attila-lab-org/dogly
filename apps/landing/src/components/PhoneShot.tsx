type PhoneShotProps = {
  src: string;
  alt: string;
};

export default function PhoneShot({ src, alt }: PhoneShotProps) {
  return (
    <div className="phone-shot">
      <div className="phone-frame">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} loading="lazy" />
      </div>
    </div>
  );
}
