import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_PATHS, LegalDocument, legalMetadata, MediatorBlock } from "@/components/legal/LegalDocument";
import { CREDIT_PACK_DETAILS, CREDIT_PACKS } from "@/domain/credits";
import { PLAN_PRICES_USD } from "@/domain/pricing";
import { REFERRAL_DISCOUNT_PERCENT, REFERRAL_REWARD_CAP, REFERRAL_REWARD_DAYS } from "@/domain/referral";
import { FREE_TILE_LIMIT } from "@/domain/user";
import { PUBLISHER } from "@/domain/publisher";

export const metadata: Metadata = legalMetadata("terms", "fr");

export default function CgvPage() {
  const email = PUBLISHER.contactEmail;
  return (
    <LegalDocument doc="terms" lang="fr">
      <h2>1. Objet et acceptation</h2>
      <p>
        Les présentes conditions régissent l&apos;utilisation du service Flexwall, accessible sur flexwall.lol, et la vente de ses offres payantes par{" "}
        {PUBLISHER.companyName} (voir les <Link href={LEGAL_PATHS.notice.fr}>mentions légales</Link>). Créer un compte vaut acceptation des conditions
        d&apos;utilisation ; souscrire une offre payante vaut acceptation des conditions de vente, confirmée par une case à cocher avant le paiement.
      </p>

      <h2>2. Le service</h2>
      <p>
        Flexwall permet de composer une page publique, un « mur », faite de tuiles alimentées par des valeurs saisies par l&apos;utilisateur ou lues sur des
        comptes qu&apos;il connecte (GitHub, Stripe, une API…), et d&apos;en tirer une image d&apos;écran de verrouillage et une image de partage. Un mur
        n&apos;est public qu&apos;une fois publié, et chaque tuile ne l&apos;est que si l&apos;utilisateur la marque comme telle.
      </p>
      <ul>
        <li>
          <strong>Gratuit :</strong> un mur, {FREE_TILE_LIMIT} tuiles, les connecteurs de base, une marque flexwall.lol sur les images.
        </li>
        <li>
          <strong>Pro :</strong> tuiles illimitées, tous les connecteurs et thèmes, l&apos;historique des valeurs, sans marque. Abonnement mensuel ou annuel.
        </li>
        <li>
          <strong>Lifetime :</strong> les fonctionnalités Pro pour la durée de vie du service, en un paiement unique. Offre limitée qui peut être retirée de la
          vente à tout moment, sans effet sur les achats déjà faits.
        </li>
      </ul>
      <p>Le détail des offres en vigueur est celui de la page Tarifs au moment de la commande.</p>

      <h2>3. Compte</h2>
      <p>
        Le compte est créé avec une adresse e-mail, par un lien de connexion. Il faut avoir au moins 16 ans pour utiliser Flexwall et être majeur, ou autorisé
        par un représentant légal, pour souscrire une offre payante. Le nom du mur (@handle) ne peut pas être changé une fois choisi. L&apos;utilisateur est
        responsable de l&apos;usage de son compte et de l&apos;exactitude de ce qu&apos;il publie.
      </p>

      <h2>4. Connexions et chiffres vérifiés</h2>
      <p>
        L&apos;utilisateur ne connecte que des comptes qu&apos;il est en droit d&apos;utiliser, avec les accès en lecture seule lorsque le service tiers en
        propose. Ces accès sont chiffrés et ne servent qu&apos;à lire les valeurs affichées. Le badge « vérifié » signifie qu&apos;une valeur a été lue sur le
        compte connecté du propriétaire au moment indiqué ; il n&apos;est pas une certification de ses résultats. Les valeurs dépendent des services tiers,
        dont l&apos;exactitude et la disponibilité ne sont pas garanties.
      </p>

      <h2>5. Règles de publication</h2>
      <p>
        Sont interdits : les contenus illicites, haineux, diffamatoires ou portant atteinte aux droits d&apos;autrui, l&apos;usurpation d&apos;identité, la
        falsification de chiffres présentés comme vérifiés, et tout usage visant à perturber le service. Tout mur peut être signalé depuis son lien « Report ».{" "}
        {PUBLISHER.companyName} peut retirer un contenu ou suspendre un compte qui enfreint ces règles, en informant l&apos;utilisateur et en lui permettant de
        faire valoir ses observations, sauf urgence ou obligation légale.
      </p>

      <h2>6. Prix</h2>
      <p>
        Les prix sont indiqués en dollars américains, toutes taxes comprises : la TVA applicable dans le pays de l&apos;acheteur est incluse et détaillée sur
        la facture. Pro : {PLAN_PRICES_USD.monthly} $ par mois ou {PLAN_PRICES_USD.yearly} $ par an. Lifetime : {PLAN_PRICES_USD.lifetime} $ en une fois. Une éventuelle conversion de devise par la banque de l&apos;acheteur reste
        à sa charge. Un changement de prix d&apos;abonnement est annoncé par e-mail au moins 30 jours avant de s&apos;appliquer, à l&apos;échéance suivante ;
        l&apos;abonné peut résilier avant.
      </p>

      <h2>7. Commande et paiement</h2>
      <p>
        Le paiement se fait par carte via Stripe, prestataire de paiement ; {PUBLISHER.companyName} n&apos;a jamais accès aux données de carte. La commande
        est ferme une fois le paiement accepté ; une facture est envoyée par e-mail et reste disponible dans l&apos;espace de facturation.
      </p>

      <h2>8. Durée, reconduction et résiliation</h2>
      <p>
        L&apos;abonnement Pro est conclu pour un mois ou un an et se renouvelle automatiquement pour la même durée, au prix en vigueur, jusqu&apos;à
        résiliation. Pour l&apos;abonnement annuel, un rappel est envoyé par e-mail avant l&apos;échéance. L&apos;abonné résilie à tout moment, en quelques
        clics, depuis Paramètres puis « Manage billing » : la résiliation prend effet à la fin de la période payée, pendant laquelle Pro reste actif, sans
        remboursement de la période en cours sauf au titre des articles 9 et 10. En cas d&apos;échec de paiement, Pro reste actif 7 jours, puis le compte repasse
        en Gratuit sans perte du mur.
      </p>

      <h2>9. Droit de rétractation</h2>
      <p>
        Le consommateur dispose d&apos;un délai de 14 jours à compter de la souscription pour se rétracter, sans avoir à se justifier (articles L221-18 et
        suivants du code de la consommation). En cochant la case prévue avant le paiement, il demande expressément que le service commence immédiatement,
        avant la fin de ce délai. S&apos;il se rétracte ensuite, la loi permettrait de lui facturer le service fourni jusqu&apos;à la rétractation (article
        L221-25) ; Flexwall y renonce et rembourse l&apos;intégralité du paiement.
      </p>
      <p>
        Pour se rétracter, il suffit d&apos;écrire à <a href={`mailto:${email}`}>{email}</a>, par exemple avec le modèle ci-dessous. Le remboursement est
        effectué sous 14 jours, sur le moyen de paiement utilisé.
      </p>
      <blockquote>
        À l&apos;attention de {PUBLISHER.companyName}, {PUBLISHER.registeredAddress}, {email} : je vous notifie par la présente ma rétractation du contrat
        portant sur la prestation de services ci-dessous. Offre souscrite : … Commandée le : … Nom : … Adresse e-mail du compte : … Date : …
      </blockquote>

      <h2>10. Garantie satisfait ou remboursé</h2>
      <p>
        Indépendamment du droit de rétractation, le premier paiement de chaque offre (le premier mois, la première année ou Lifetime) est remboursé
        intégralement sur simple demande écrite dans les 14 jours qui le suivent.
      </p>

      <h2>11. Disponibilité</h2>
      <p>
        Le service est fourni en l&apos;état, avec un effort raisonnable de disponibilité, et peut être interrompu pour maintenance. Les connecteurs dépendent
        de services tiers qui peuvent modifier ou couper leur accès ; Flexwall adapte ou retire alors le connecteur concerné.
      </p>

      <h2>12. Responsabilité</h2>
      <p>
        {PUBLISHER.companyName} répond des dommages directs causés par un manquement à ses obligations. Sa responsabilité ne couvre ni les contenus publiés
        par les utilisateurs, ni les données fournies par les services tiers, ni les décisions prises sur la foi des valeurs affichées. Pour un utilisateur
        professionnel, elle est limitée aux sommes payées au cours des 12 derniers mois. Rien dans ces conditions ne limite les droits que le consommateur tient
        de la loi, notamment la garantie légale de conformité des services numériques (articles L224-25-12 et suivants du code de la consommation).
      </p>

      <h2>13. Propriété intellectuelle</h2>
      <p>
        L&apos;utilisateur reste propriétaire de ce qu&apos;il publie. Il accorde à {PUBLISHER.companyName} le droit, non exclusif et gratuit,
        d&apos;héberger, reproduire et afficher ces contenus dans le monde entier, pour la seule fourniture du service (pages publiques, images de partage,
        annuaire), tant qu&apos;ils sont publiés. Le service, son nom et son logiciel restent la propriété de {PUBLISHER.companyName}.
      </p>

      <h2>14. Fermeture du compte</h2>
      <p>
        L&apos;utilisateur peut à tout moment demander la fermeture de son compte en écrivant à <a href={`mailto:${email}`}>{email}</a> ; le compte, le mur et
        les connexions sont supprimés sous 30 jours, un abonnement en cours étant résilié. Les données de facturation sont conservées pour la durée imposée par
        la loi. Le traitement des données personnelles est décrit dans la <Link href={LEGAL_PATHS.privacy.fr}>politique de confidentialité</Link>.
      </p>

      <h2>15. Modification des conditions</h2>
      <p>
        Toute modification substantielle est annoncée par e-mail au moins 30 jours avant de s&apos;appliquer. L&apos;utilisateur qui la refuse peut résilier
        avant son entrée en vigueur. La version applicable à une commande est celle acceptée lors de celle-ci.
      </p>

      <h2>16. Parrainage</h2>
      <p>
        Chaque compte dispose d&apos;un lien d&apos;invitation. La personne qui crée son compte par ce lien bénéficie de {REFERRAL_DISCOUNT_PERCENT} % de
        réduction sur son premier paiement, quelle que soit l&apos;offre. Pour chaque invité dont le premier paiement aboutit, le parrain reçoit{" "}
        {REFERRAL_REWARD_DAYS} jours de Pro, dans la limite de {REFERRAL_REWARD_CAP} invités récompensés ; les périodes s&apos;enchaînent. Si ce premier
        paiement est remboursé dans les 14 jours, la récompense est retirée. Les récompenses n&apos;ont aucune valeur monétaire et ne sont ni échangeables ni
        cessibles. Il est interdit de se parrainer soi-même ou de créer des comptes pour obtenir des récompenses : celles ainsi obtenues sont retirées.{" "}
        {PUBLISHER.companyName} peut modifier ou arrêter le programme pour l&apos;avenir ; les récompenses déjà acquises sont conservées.
      </p>

      <h2>17. Crédits</h2>
      <p>
        Certains connecteurs, X aujourd&apos;hui, lisent avec une clé payante détenue par {PUBLISHER.companyName} et se paient en crédits, vendus par
        packs :{" "}
        {CREDIT_PACKS.map((p) => `${CREDIT_PACK_DETAILS[p].credits} crédits pour ${String(CREDIT_PACK_DETAILS[p].priceUsd).replace(".", ",")} $`).join(", ")},
        toutes taxes comprises. Un crédit est consommé par compte connecté pour chaque jour UTC où il est actualisé auprès du fournisseur ; les
        actualisations suivantes du même jour, et les jours sans actualisation, ne coûtent rien. Une actualisation qui échoue rend son crédit. Les crédits sont
        livrés dès l&apos;acceptation du paiement, n&apos;expirent pas tant que le service existe, n&apos;ont aucune valeur monétaire et ne sont pas cessibles.
        En cochant la case avant le paiement, vous demandez leur livraison avant la fin du délai de rétractation ; les crédits non consommés sont remboursés sur
        demande écrite dans les 14 jours suivant l&apos;achat. Sans crédits, ces connecteurs continuent d&apos;afficher leurs dernières valeurs. Si un
        fournisseur cesse de servir la clé ou change ses prix, {PUBLISHER.companyName} peut retirer le connecteur ; les crédits non consommés sont alors
        remboursés sur demande.
      </p>

      <h2>18. Réclamations, médiation et droit applicable</h2>
      <p>
        Toute réclamation s&apos;adresse d&apos;abord à <a href={`mailto:${email}`}>{email}</a>.
      </p>
      <MediatorBlock lang="fr" />
      <p>
        Les présentes conditions sont soumises au droit français. Le consommateur peut saisir, à son choix, la juridiction du lieu où il demeurait lors de la
        commande ou celle du défendeur. Pour un utilisateur professionnel, les tribunaux de Lyon sont seuls compétents.
      </p>
    </LegalDocument>
  );
}
