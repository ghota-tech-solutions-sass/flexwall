import type { Metadata } from "next";
import { LegalDocument, legalMetadata, ProcessorList, PublisherIdentityList } from "@/components/legal/LegalDocument";
import { ProcessingTable } from "@/components/legal/ProcessingTable";
import { PUBLISHER } from "@/domain/publisher";

export const metadata: Metadata = legalMetadata("privacy", "fr");

export default function ConfidentialitePage() {
  const email = PUBLISHER.contactEmail;
  return (
    <LegalDocument doc="privacy" lang="fr">
      <h2>Responsable du traitement</h2>
      <PublisherIdentityList lang="fr" />

      <h2>Ce que nous traitons, pourquoi et combien de temps</h2>
      <ProcessingTable lang="fr" />
      <p>
        Aucune donnée n&apos;est vendue, louée ni utilisée pour de la publicité. Aucun profilage, aucune décision automatisée.
      </p>

      <h2>Ce qui est public</h2>
      <p>
        Un mur publié, et les tuiles marquées publiques, sont visibles par tous, indexables par les moteurs de recherche et reproduits dans les images de
        partage ; un mur listé apparaît aussi dans l&apos;annuaire. Les tuiles privées, vos accès et votre adresse e-mail ne sont jamais publiés. Le lien de
        l&apos;écran de verrouillage est secret et peut être renouvelé depuis l&apos;éditeur.
      </p>

      <h2>Destinataires</h2>
      <p>Les données sont traitées par {PUBLISHER.companyName} et par ses sous-traitants, liés par contrat et soumis au RGPD :</p>
      <ProcessorList lang="fr" />
      <p>
        Les services que vous connectez (GitHub, Stripe, etc.) reçoivent les requêtes faites avec vos accès, à votre demande ; leur propre politique de
        confidentialité s&apos;applique à ce qu&apos;ils détiennent.
      </p>

      <h2>Transferts hors de l&apos;Union européenne</h2>
      <p>
        Les données sont stockées dans l&apos;Union européenne (Belgique). Stripe et Google peuvent en traiter une partie aux États-Unis, sur le fondement de la
        décision d&apos;adéquation de la Commission européenne relative au Data Privacy Framework et de clauses contractuelles types.
      </p>

      <h2>Cookies et stockage local</h2>
      <p>
        Flexwall n&apos;utilise qu&apos;un cookie, <code>fw_session</code>, strictement nécessaire pour rester connecté (30 jours), et le stockage de session du
        navigateur pour retenir le handle saisi avant la connexion. Aucun cookie de mesure d&apos;audience, de publicité ou de tiers : aucun consentement
        n&apos;est donc demandé.
      </p>

      <p>Des compteurs anonymes mesurent les pages vues sur les pages publiques et le mur officiel. Les totaux sont publics. Le compteur ne conserve ni adresse IP, ni cookie, ni identifiant persistant de visiteur. Un nombre limité d’identifiants aléatoires de requête limitent les doublons sans identifier les visiteurs. Les signaux Do Not Track et Global Privacy Control sont respectés.</p>

      <h2>Sécurité</h2>
      <p>
        Connexions chiffrées (HTTPS), accès des connexions chiffrés au repos en AES-256-GCM, connexion sans mot de passe par lien à usage limité, accès aux
        serveurs restreint.
      </p>

      <h2>Vos droits</h2>
      <p>
        Vous disposez des droits d&apos;accès, de rectification, d&apos;effacement, de limitation, d&apos;opposition et de portabilité, ainsi que du droit de
        définir des directives sur le sort de vos données après votre décès. Écrivez à <a href={`mailto:${email}`}>{email}</a> depuis l&apos;adresse de votre
        compte : nous répondons sous un mois. Vous pouvez aussi introduire une réclamation auprès de la CNIL, 3 place de Fontenoy, TSA 80715, 75334 Paris Cedex
        07, <a href="https://www.cnil.fr">www.cnil.fr</a>.
      </p>

      <h2>Mineurs</h2>
      <p>Flexwall n&apos;est pas destiné aux moins de 16 ans.</p>

      <h2>Modifications</h2>
      <p>Toute modification substantielle de cette politique est annoncée par e-mail avant de s&apos;appliquer.</p>
    </LegalDocument>
  );
}
