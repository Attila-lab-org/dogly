/**
 * Safety copy DETERMINISTICO (Spec V1 sez. 16.1 / 19.3 / 22.1):
 * i flag di sicurezza digestivi producono sempre copy fisso revisionato,
 * mai testo generato dal modello. Il testo generato può riassumere
 * l'osservazione ma non può mai declassare un safety flag.
 *
 * REGOLA: non modificare queste stringhe senza review; non sostituirle
 * con output AI. Nessuna diagnosi medica, sempre wording prudente.
 */
import type { SafetyFlagCode } from './types';

export interface SafetyCopy {
  title: string;
  message: string;
  /** Azione suggerita, fissa */
  action: string;
}

export const SAFETY_COPY: Record<SafetyFlagCode, SafetyCopy> = {
  BLOOD_CANDIDATE: {
    title: 'Possibile sangue visibile',
    message:
      "Nella foto sembra esserci una possibile traccia di sangue. Non è una diagnosi: solo il veterinario può valutarla.",
    action: 'Contatta il veterinario',
  },
  MELENA_CANDIDATE: {
    title: 'Possibili feci nere o catramose',
    message:
      "Il colore osservato sembra compatibile con feci molto scure. Può avere cause diverse: merita attenzione.",
    action: 'Contatta il veterinario',
  },
  FOREIGN_MATERIAL_CANDIDATE: {
    title: 'Possibile materiale insolito',
    message:
      'Nella foto sembra esserci qualcosa di insolito. Osserva come sta il tuo cane e non provare a rimuoverlo.',
    action: 'Se hai dubbi, contatta il veterinario',
  },
  REPEATED_WATERY: {
    title: 'Episodi liquidi ripetuti',
    message:
      'Negli ultimi giorni sembrano esserci episodi liquidi ripetuti. Monitora il tuo cane e tieni traccia dei pasti.',
    action: 'Se continua, contatta il veterinario',
  },
  DIGESTIVE_SYMPTOMS: {
    title: 'Più segnali insieme',
    message:
      'Hai segnalato vomito insieme a episodi liquidi recenti. È meglio chiedere un parere professionale.',
    action: 'Contatta il veterinario',
  },
  RAPID_WORSENING: {
    title: 'Peggioramento rapido rispetto al solito',
    message:
      "Le ultime osservazioni sembrano peggiorare in fretta rispetto alla baseline del tuo cane.",
    action: 'Contatta il veterinario',
  },
};

/** Disclaimer gentile, fisso, mostrato in capture e result (sez. 19 / O-02). */
export const DIGESTIVE_DISCLAIMER =
  'Osservazione automatica, non diagnosi veterinaria. Se hai dubbi, parla con il veterinario.';

/**
 * Regola "nessuna assenza provata" (sez. 19.3): se il modello non vede
 * un'anomalia, questo NON prova che non ci sia.
 */
export const ABSENCE_NOT_PROOF_NOTE =
  "Una foto senza segnali evidenti non può escludere un problema.";

/** Nota sulla stima del fecal score (sez. 19.1). */
export const FECAL_SCORE_ESTIMATE_NOTE =
  'Il punteggio 1–7 è una stima dalla foto, non una misura di laboratorio.';
