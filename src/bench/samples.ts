import type { RewriteId } from '../review/prompts';

/** Made-up texts for the quality bench. Never real data. */
export const SAMPLES: { id: string; task: RewriteId; text: string }[] = [
  {
    id: 'fr-fix',
    task: 'fix',
    text: "bonjour dre tremblay,\n\nsuivi pour le pt dont on a parlé mardi, il est pret pour le congé vers la réadapt vendredi si l'eval en physio est ok. pouvez vous confirmé que les ordonnances sont signées? dossier 4482913\n\nmerci beaucoup\nJordan",
  },
  {
    id: 'fr-pro',
    task: 'professional',
    text: 'salut, encore une fois le formulaire est pas rempli. faut le faire avant demain sinon le dossier bloque. rappelle la famille au (514) 555-0187.',
  },
  {
    id: 'fr-short',
    task: 'shorter',
    text: "Je voulais simplement vous écrire pour faire un suivi concernant la rencontre que nous avons eue la semaine dernière au sujet du dossier de Mme Gagnon, née le 02/07/1948. Comme nous en avions discuté, il faudrait idéalement que l'évaluation soit complétée avant le 15 novembre afin que nous puissions planifier la suite des choses. N'hésitez pas à me faire signe si vous avez des questions.",
  },
  {
    id: 'fr-clear',
    task: 'clearer',
    text: "donc pour jeudi je pense qu'on avait dit que le transfert pourrait se faire mais il manque encore le consentement signé et aussi la liste des médicaments, est-ce que vous pouvez m'envoyer ça?",
  },
  {
    id: 'en-fix',
    task: 'fix',
    text: 'hi dr. patel,\n\nfollowing up on the pt we discused tuesday, they r ready for discharge friday pending the final PT eval. can u confirm the orders are signed? MRN 00482913\n\nthanks\nSam',
  },
  {
    id: 'en-pro',
    task: 'professional',
    text: "hey, the invoice is late AGAIN. send it today or we can't close the file. call me at (514) 555-0142.",
  },
  {
    id: 'en-short',
    task: 'shorter',
    text: 'I just wanted to reach out and touch base regarding the client we discussed during this morning\'s meeting, because I think there may have been some confusion about the plan. As far as I understand it, the contract will be signed on Thursday, but only if the legal review is completed before then, which could take one to three business days.',
  },
  {
    id: 'en-clear',
    task: 'clearer',
    text: 'so re the employee file, i think we agreed the review could happen next week but the self-assessment is still missing and the manager notes too, could you send those?',
  },
];
