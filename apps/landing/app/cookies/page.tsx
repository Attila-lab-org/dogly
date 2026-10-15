import Link from 'next/link';

export const metadata = { title: 'Cookie | DOGly', description: 'Informazioni sui cookie e sulla memoria locale usati da DOGly.' };

export default function CookiesPage() {
  return <main className="legal-page">
    <Link href="/" className="legal-back">← Torna a DOGly</Link>
    <h1>Cookie e memoria locale</h1><p className="legal-updated">Beta chiusa</p>
    <p>La landing usa solo ciò che serve a visualizzare il sito e a funzionare correttamente. L’app può usare memoria locale per mantenere preferenze e stato della sessione.</p>
    <p>Non usiamo cookie pubblicitari o di profilazione nella landing beta. Se questa scelta cambia, aggiorneremo questa pagina prima dell’attivazione.</p>
    <p>Per i dati dell’account e del cane valgono le regole della <Link href="/privacy">Privacy</Link>.</p>
  </main>;
}
