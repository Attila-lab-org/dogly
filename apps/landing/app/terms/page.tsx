import Link from 'next/link';

export const metadata = { title: 'Termini | DOGly', description: 'Termini d’uso della beta DOGly.' };

export default function TermsPage() {
  return <main className="legal-page">
    <Link href="/" className="legal-back">← Torna a DOGly</Link>
    <h1>Termini d’uso</h1><p className="legal-updated">Beta chiusa</p>
    <p>DOGly fornisce osservazioni probabilistiche sul comportamento del cane. I risultati possono essere incompleti o inesatti e non costituiscono diagnosi veterinaria.</p>
    <p>Non usare DOGly per decisioni mediche o situazioni di sicurezza urgenti. In caso di dubbio, contatta un veterinario.</p>
    <p>Le funzioni beta possono cambiare o essere ritirate. Eventuali acquisti saranno descritti separatamente prima dell’attivazione.</p>
  </main>;
}
