import type { Metadata } from "next";
import { LegalDocument, legalMetadata, PublisherIdentityList } from "@/components/legal/LegalDocument";
import { HOST, PUBLISHER } from "@/domain/publisher";
import { SOURCE_URL } from "@/site";

export const metadata: Metadata = legalMetadata("notice", "fr");

export default function MentionsLegalesPage() {
  return (
    <LegalDocument doc="notice" lang="fr">
      <p>
        Conformément à l&apos;article 6 III de la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l&apos;économie numérique, les informations suivantes
        sont portées à la connaissance des utilisateurs du site flexwall.lol.
      </p>

      <h2>Éditeur</h2>
      <PublisherIdentityList lang="fr" />

      <h2>Hébergement</h2>
      <p>
        <strong>{HOST.name}</strong>, {HOST.address}. {HOST.role.fr}.
      </p>

      <h2>Propriété intellectuelle</h2>
      <p>
        Le nom Flexwall, la conception du site, ses textes et son logiciel appartiennent à {PUBLISHER.companyName}, à l&apos;exception des contenus publiés
        par les utilisateurs, qui restent les leurs, et des marques de tiers affichées sur les tuiles, qui appartiennent à leurs titulaires.
        {SOURCE_URL ? (
          <>
            {" "}
            Le <a href={SOURCE_URL}>code source</a> est publié sous licence AGPL-3.0 ; le SDK et les plugins sous licence MIT.
          </>
        ) : null}
      </p>

      <h2>Signaler un contenu</h2>
      <p>
        Pour signaler un mur contraire à la loi ou à nos conditions, utilisez le lien en bas du mur ou écrivez à{" "}
        <a href={`mailto:${PUBLISHER.contactEmail}`}>{PUBLISHER.contactEmail}</a>. Les signalements sont examinés promptement et les contenus illicites
        retirés.
      </p>
    </LegalDocument>
  );
}
