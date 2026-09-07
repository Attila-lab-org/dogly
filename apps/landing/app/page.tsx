import FeatureSection from "@/src/components/FeatureSection";
import PhoneShot from "@/src/components/PhoneShot";
import StoreButtons from "@/src/components/StoreButtons";

export default function Home() {
  return (
    <>
      <header className="site-header">
        <span className="brand">Dogly</span>
        <StoreButtons />
      </header>

      <main>
        <section className="hero">
          <div className="hero-text">
            <h1>Chi ama il proprio cane, lo capisce.</h1>
            <p className="hero-sub">
              Dogly ti aiuta a interpretare quello che il tuo cane ti sta dicendo —
              dal suo comportamento alla sua digestione — fondandosi sul sapere dei
              migliori veterinari ed esperti, in parole semplici.
            </p>
            <StoreButtons />
          </div>
          <PhoneShot
            src="/screenshots/home.png"
            alt="Schermata home di Dogly con la scheda del cane e la CTA Capisci Rocky"
          />
        </section>

        <section className="trust-band">
          <p className="eyebrow">Fondato sul sapere veterinario</p>
          <h2>Dietro ogni risposta, c&rsquo;è una conoscenza seria</h2>
          <p>
            Ogni interpretazione di Dogly si appoggia a una base di conoscenza
            scientifica costruita con esperti di comportamento e salute veterinaria.
            Non numeri magici: ti mostriamo le evidenze, il livello di confidenza e
            una formula sempre versionata e migliorabile.
          </p>
          <p className="trust-note">
            Dogly osserva e ti aiuta a notare: il tuo veterinario resta il primo
            riferimento per la sua salute.
          </p>
        </section>

        <FeatureSection
          id="comportamento"
          eyebrow="Comportamento"
          title="Non è solo un abbaiare. È un messaggio."
          description="Quando abbaia, si agita o si nasconde, il tuo cane ti sta comunicando qualcosa. Registri il momento e Dogly ti aiuta a leggerlo: cosa sembra provare, perché, con quanta confidenza."
          bullets={[
            "Un breve video, anche solo di 5–20 secondi",
            "Interpretazione onesta: sembra, probabilmente, possibile",
            "Le evidenze spiegate in parole semplici, non un voto",
            "Puoi dire come è andata: impara da ogni correzione",
          ]}
          screenshot="/screenshots/risultato.png"
          screenshotAlt="Schermata risultato di Dogly con banda di confidenza e evidenze"
        />

        <FeatureSection
          id="diario"
          eyebrow="Diario"
          title="Impara a riconoscere i suoi segnali, giorno dopo giorno"
          description="Ogni momento che registri diventa parte di un diario unico. Col tempo smetti di chiederti «è normale?»: conosci la sua normalità, perché la vedi con i tuoi occhi."
          bullets={[
            "Tutto di lui in una timeline: comportamento e digestione",
            "I pattern emergono da solo, senza questionari",
            "Quando qualcosa cambia, te ne accorgi per primo",
          ]}
          screenshot="/screenshots/home.png"
          screenshotAlt="Schermata del diario di Dogly con la timeline degli eventi"
          reversed
        />

        <FeatureSection
          id="digestione"
          eyebrow="Digestione"
          title="La pancia è metà del suo linguaggio"
          description="Come mangia e come digerisce ti racconta come sta. Dogly tiene traccia della sua baseline personale, così sai riconoscere subito quando qualcosa non va per lui."
          bullets={[
            "Una foto semplice, un controllo alla volta",
            "Il suo normale, non una media di cani qualsiasi",
            "Ti aiuta a notare i cambiamenti, prima",
          ]}
          screenshot="/screenshots/risultato.png"
          screenshotAlt="Schermata di controllo digestivo in Dogly"
        />

        <FeatureSection
          id="rocky"
          eyebrow="Rocky"
          title="Più lo osservi, più lo conosci. Più lo conosci, più lo capisci."
          description="Rocky è la sua scheda viva: cosa hai imparato di lui, quali pattern si ripetono, come vive. Dogly misura quanto lo conosci davvero — e ti mostra cosa ti manca da scoprire."
          bullets={[
            "La tua copertura di conoscenza su di lui, formula versionata",
            "I suoi pattern, raccolti dal vostro diario reale",
            "Il suo stile di vita, sempre sotto controllo",
          ]}
          screenshot="/screenshots/rocky.png"
          screenshotAlt="Schermata profilo di Rocky in Dogly con knowledge score e pattern"
          reversed
        />

        <section className="final-cta">
          <h2>Lui ti capisce sempre. Ora tocca a te.</h2>
          <p>
            Scarica Dogly e registra il primo video: è il primo passo per capire il
            tuo migliore amico.
          </p>
          <StoreButtons />
        </section>
      </main>

      <footer className="site-footer">
        <span className="brand">Dogly</span>
        <p>com.attilalab.dogly · © 2026 Dogly</p>
        <p className="footer-note">
          Dogly nasce dal sapere di veterinari ed esperti e ti aiuta a osservare il
          tuo cane: per la sua salute, il tuo veterinario resta il riferimento.
          {/* TODO: collegare privacy e termini pubblici prima del lancio (sorgenti: docs/PRIVACY_BETA.md, docs/TERMS_BETA.md) */}
        </p>
      </footer>
    </>
  );
}
