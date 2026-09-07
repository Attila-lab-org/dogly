import PhoneShot from "@/src/components/PhoneShot";

type FeatureSectionProps = {
  id?: string;
  eyebrow: string;
  title: string;
  description: string;
  bullets: string[];
  screenshot: string;
  screenshotAlt: string;
  reversed?: boolean;
};

export default function FeatureSection({
  id,
  eyebrow,
  title,
  description,
  bullets,
  screenshot,
  screenshotAlt,
  reversed = false,
}: FeatureSectionProps) {
  return (
    <section id={id} className={`feature${reversed ? " feature--reversed" : ""}`}>
      <div className="feature-text">
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p className="feature-description">{description}</p>
        <ul>
          {bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      </div>
      <PhoneShot src={screenshot} alt={screenshotAlt} />
    </section>
  );
}
