import type { Lang } from "./LegalDocument";

type Row = Record<Lang, { what: string; why: string; basis: string; kept: string }>;

/**
 * What Flexwall stores, why, on what legal basis and for how long. Retention
 * figures mirror the code: snapshots keep 400 days (DbSnapshots.KEEP_DAYS),
 * the session cookie 30 days (HmacTokenService).
 */
const ROWS: Row[] = [
  {
    en: { what: "Email address, handle, time zone, account creation date", why: "Signing you in and running your account", basis: "Contract", kept: "While the account exists, deleted within 30 days of closing it" },
    fr: { what: "Adresse e-mail, handle, fuseau horaire, date de création du compte", why: "Vous connecter et gérer votre compte", basis: "Exécution du contrat", kept: "Tant que le compte existe, supprimées sous 30 jours après sa fermeture" },
  },
  {
    en: { what: "Your wall: title, bio, tiles, theme, what you type in tiles", why: "Showing your wall, lock screen and share card", basis: "Contract", kept: "While the account exists" },
    fr: { what: "Votre mur : titre, bio, tuiles, thème, textes saisis", why: "Afficher votre mur, votre écran de verrouillage et votre image de partage", basis: "Exécution du contrat", kept: "Tant que le compte existe" },
  },
  {
    en: { what: "Connection credentials (API keys, tokens), encrypted with AES-256-GCM", why: "Reading the values on your tiles from the services you connect", basis: "Contract", kept: "Until you remove the connection or close the account" },
    fr: { what: "Accès des connexions (clés d'API, jetons), chiffrés en AES-256-GCM", why: "Lire les valeurs de vos tuiles sur les services que vous connectez", basis: "Exécution du contrat", kept: "Jusqu'au retrait de la connexion ou à la fermeture du compte" },
  },
  {
    en: { what: "Values read from those services, and one reading a day per number", why: "Displaying values quickly and drawing history charts", basis: "Contract", kept: "Latest values while in use; daily readings 400 days" },
    fr: { what: "Valeurs lues sur ces services et un relevé par jour par nombre", why: "Afficher les valeurs rapidement et tracer l'historique", basis: "Exécution du contrat", kept: "Dernières valeurs tant qu'elles servent ; relevés quotidiens 400 jours" },
  },
  {
    en: { what: "Plan, Stripe customer and subscription identifiers, acceptance of the terms at checkout; invoices and payment data are held by Stripe", why: "Selling and managing plans, invoicing, proving consent", basis: "Contract; legal obligation for accounting records", kept: "Accounting records 10 years (French Commercial Code, L123-22); the rest while the account exists" },
    fr: { what: "Offre, identifiants client et abonnement Stripe, acceptation des conditions au paiement ; factures et données de paiement détenues par Stripe", why: "Vendre et gérer les offres, facturer, prouver le consentement", basis: "Exécution du contrat ; obligation légale pour les pièces comptables", kept: "Pièces comptables 10 ans (code de commerce, L123-22) ; le reste tant que le compte existe" },
  },
  {
    en: { what: "Wall reports: the reason given and, if you leave one, a contact", why: "Moderating walls and answering the reporter", basis: "Legitimate interest and legal obligations of a host", kept: "1 year" },
    fr: { what: "Signalements : le motif et, si vous le laissez, un contact", why: "Modérer les murs et répondre à l'auteur du signalement", basis: "Intérêt légitime et obligations légales d'hébergeur", kept: "1 an" },
  },
  {
    en: { what: "Technical logs: IP address, browser, pages requested, errors", why: "Security, abuse prevention, fixing faults", basis: "Legitimate interest", kept: "30 days" },
    fr: { what: "Journaux techniques : adresse IP, navigateur, pages demandées, erreurs", why: "Sécurité, prévention des abus, correction des pannes", basis: "Intérêt légitime", kept: "30 jours" },
  },
];

const HEADERS: Record<Lang, [string, string, string, string]> = {
  en: ["Data", "Purpose", "Legal basis", "Kept"],
  fr: ["Données", "Finalité", "Base légale", "Conservation"],
};

export function ProcessingTable({ lang }: { lang: Lang }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {HEADERS[lang].map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.en.what}>
              <td>{row[lang].what}</td>
              <td>{row[lang].why}</td>
              <td>{row[lang].basis}</td>
              <td>{row[lang].kept}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
