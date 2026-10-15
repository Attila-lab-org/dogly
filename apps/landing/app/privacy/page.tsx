import Link from 'next/link';

export const metadata = { title: 'Privacy | DOGly', description: 'Informativa privacy della beta DOGly.' };

export default function PrivacyPage() {
  return <main className="legal-page">
    <Link href="/" className="legal-back">← Torna a DOGly</Link>
    <h1>Privacy</h1>
    <p className="legal-updated">Informativa della beta chiusa · ultimo aggiornamento: staging beta</p>
    <h2>Cosa raccogliamo</h2>
    <ul><li>Identificativi dell’account gestiti da Supabase Auth.</li><li>Dati del profilo del cane inseriti dal proprietario.</li><li>Video e foto caricati, risultati delle analisi, feedback e consumi.</li></ul>
    <h2>Conservazione</h2>
    <p>I video grezzi usati per un’analisi sono temporanei. La loro eliminazione segue il TTL configurato; l’album fotografico resta separato dai video di comportamento.</p>
    <h2>I tuoi controlli</h2>
    <p>Nelle impostazioni puoi gestire i consensi, esportare i dati e richiedere l’eliminazione dell’account. La ricerca e l’addestramento sono disattivati di default.</p>
    <h2>Contatti</h2><p>Per la beta, usa il contatto indicato nel messaggio di invito al test.</p>
  </main>;
}
