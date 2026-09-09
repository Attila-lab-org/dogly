/**
 * Mock tipizzati Advice Engine V2 (ADR-012, brief sez. 11/13).
 * Catalogo consigli: UNA voce per intent azionabile, struttura già allineata
 * al catalogo backend (`advice_catalog`): il mobile non inventa mai azioni.
 * I mock vivono SOLO nel mock gate dev: con API attiva e consiglio assente
 * nel payload evento, la card non viene mostrata (mai inventare).
 * Copy: azioni concrete in linguaggio semplice, spiegazioni senza citazioni
 * scientifiche grezze; intent safety (FEAR_INSECURITY / DISCOMFORT_AVOIDANCE)
 * hanno una voce prudente ma restano soppressi in UI (nota sicurezza prioritaria).
 */
import type { BehaviorIntent } from '../contracts/types';
import type { AdviceItem } from '../features/advice/types';
import type { LifestyleProfile } from '../features/lifestyle/types';
import { DOG_ID } from './core';

export const adviceCatalogMock: Partial<Record<BehaviorIntent, AdviceItem>> = {
  PLAY_INTERACTION: {
    code: 'play-5min-ball',
    category: 'ENRICHMENT',
    actionText: 'Prova a proporgli 5 minuti di gioco con la palla.',
    whyText:
      'Quando un cane ti invita al gioco con il corpo rilassato, un breve momento insieme scarica energia in modo positivo e rafforza il vostro legame.',
    risk: 'LOW',
  },
  ATTENTION_REQUEST: {
    code: 'attention-calm-minutes',
    category: 'ROUTINE',
    actionText:
      'Dedica qualche minuto di attenzione tranquilla: una carezza o due parole con voce calma.',
    whyText:
      'Chi cerca contatto in modo gentile spesso vuole solo un po\' di compagnia: rispondere con calma lo rassicura senza rinforzare l\'insistenza.',
    risk: 'LOW',
  },
  OUTSIDE_REQUEST: {
    code: 'outside-short-walk',
    category: 'ROUTINE',
    actionText:
      'Portalo fuori per una breve passeggiata: potrebbe avere bisogno di fare i bisogni.',
    whyText:
      'Guardare la porta o avvicinarsi all\'uscita è spesso il suo modo di chiedere di uscire: rispondere subito rinforza una buona abitudine.',
    risk: 'LOW',
  },
  ALERT_VIGILANCE: {
    code: 'alert-observe-calm',
    category: 'MONITOR',
    actionText:
      'Osserva con calma cosa ha attirato la sua attenzione, senza agitarti.',
    whyText:
      'Restare vigili è normale quando c\'è un suono o un movimento nuovo: la tua calma gli dice che non c\'è pericolo.',
    risk: 'LOW',
  },
  DISCOMFORT_AVOIDANCE: {
    code: 'discomfort-give-space',
    category: 'LOW_RISK_MANAGEMENT',
    actionText:
      'Dagli spazio e non forzare il contatto: lascia che sia lui ad avvicinarsi.',
    whyText:
      'Un cane a disagio ha bisogno di distanza per sentirsi sicuro: rispettarla riduce la tensione e costruisce fiducia.',
    risk: 'CAUTION',
  },
  FEAR_INSECURITY: {
    code: 'fear-give-space-calm',
    category: 'LOW_RISK_MANAGEMENT',
    actionText:
      'Dagli spazio, non forzare il contatto: parla con voce calma e lascia che si avvicini da solo.',
    whyText:
      'Quando un cane mostra paura, avvicinarsi o toccarlo può aumentare la sua tensione: la scelta di avvicinarsi deve restare sua.',
    risk: 'CAUTION',
  },
  HIGH_AROUSAL: {
    code: 'arousal-calm-down',
    category: 'LOW_RISK_MANAGEMENT',
    actionText:
      'Aiutalo a calmarsi: voce bassa, movimenti lenti e niente giochi eccitanti adesso.',
    whyText:
      'Quando l\'eccitazione è alta, aggiungere stimoli la alza ancora: un ambiente calmo lo aiuta a tornare in equilibrio.',
    risk: 'LOW',
  },
  FRUSTRATION: {
    code: 'frustration-simple-alternative',
    category: 'ENRICHMENT',
    actionText:
      'Offrigli un\'alternativa semplice, come un gioco da masticare o qualche minuto di sniffing.',
    whyText:
      'La frustrazione nasce spesso da un bisogno bloccato: un\'attività alla sua portata gli dà una valvola di sfogo positiva.',
    risk: 'LOW',
  },
  RELAX_REST: {
    code: 'rest-let-him-recharge',
    category: 'ROUTINE',
    actionText: 'Lascialo riposare: sta ricaricando le energie.',
    whyText:
      'Il riposo è parte del suo benessere: un cane rilassato che dorme tranquillo va lasciato in pace.',
    risk: 'LOW',
  },
  RESOURCE_TENSION: {
    code: 'resource-no-force-trade',
    category: 'LOW_RISK_MANAGEMENT',
    actionText:
      'Non strappargli la risorsa: allontanati e proponi uno scambio con un bocconcino.',
    whyText:
      'Forzare la consegna aumenta la tensione intorno alle risorse: lo scambio insegna che cedere conviene.',
    risk: 'CAUTION',
  },
};

/**
 * Profilo lifestyle mock: volutamente INCOMPLETO (progressive profiling,
 * brief sez. 13) — la micro-card Home "Aiutami a conoscerlo meglio" resta
 * visibile finché il profilo non è completo.
 */
export const lifestyleProfileMock: LifestyleProfile = {
  dogId: DOG_ID,
  activity: 'MODERATE',
  sleep: null,
  timeAlone: null,
  feedingLabel: 'Natural Trainer Adult Medium Salmone e Riso',
  social: null,
  enrichment: null,
  updatedAt: null,
};
