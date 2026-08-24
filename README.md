# flexwall.lol

Post your money. Take your rank.

A public wall where the only thing being bought, ranked and judged is **money
itself**. Inspired by outbid.lol — minus the products. Entry minimum $1,000.

## Stack

| Couche | Choix |
|---|---|
| App | Next.js 15 (App Router, SSR), TypeScript |
| Runtime | Bun (Docker multi-stage, convention lettrio) |
| Paiements | Stripe hosted Checkout à montant libre + webhook signé |
| Base | Firestore natif — collection `entries`, un doc par handle |
| Infra | GCP Cloud Run + Artifact Registry + Secret Manager |
| IaC | Terraform (backend GCS `micro-sass-478507-tfstate`, provider Stripe) |

## Arborescence

    src/app/page.tsx               # mur SSR (classement par fortune)
    src/app/entered/               # confirmation post-paiement
    src/app/api/checkout/route.ts  # création session Checkout (montant libre)
    src/app/api/webhooks/stripe/   # vérif signature → crédit du handle
    src/lib/store/entries.ts       # Firestore (+ fallback mémoire démo)
    terraform/                     # projet GCP complet + webhook Stripe

## Base de données

Firestore natif. En production : provisionné par Terraform (`firestore.tf`), le service account Cloud Run y accède sans secret.

En local, deux modes :

| Mode | Déclencheur |
|---|---|
| Mémoire seedée (démo) | aucun `GOOGLE_PROJECT_ID` |
| **Émulateur officiel** (persistance réelle) | `FIRESTORE_EMULATOR_HOST=localhost:8080` + `GOOGLE_PROJECT_ID=demo-flexwall` |

Démarrer l'émulateur :

```bash
docker run -d --name fw-firestore-emulator -p 8080:8080 \
  gcr.io/google.com/cloudsdktool/google-cloud-cli:emulators \
  gcloud beta emulators firestore start --host-port=0.0.0.0:8080
```

Collections : `entries` (1 doc par slug, incrément transactionnel) · `events` (journal entry/top-up).

## Développement local

    bun install
    bun dev            # http://localhost:3000

Sans credentials Stripe/GCP, l'app tourne en **mode démo** : données seedées en
mémoire, le formulaire affiche que les paiements ne sont pas branchés. Avec un
.env rempli (voir `.env.example`), checkout et webhook fonctionnent réellement :

    stripe listen --forward-to localhost:3000/api/webhooks/stripe   # donne STRIPE_WEBHOOK_SECRET

## Déploiement

1. **Secrets** : remplir `terraform.tfvars` (`cp terraform.tfvars.example
   terraform.tfvars`) — project id, billing account, folder, clé Stripe.
2. **Infra** :
       cd terraform && ./deploy.sh init && ./deploy.sh apply
   Crée le projet GCP, Firestore, Cloud Run, Artifact Registry, secrets,
   et le webhook Stripe (dont le secret de signature est versé dans Secret
   Manager automatiquement).
3. **App** :
       ./deploy.sh deploy     # build docker → push → cloud run deploy

## Le webhook fait quoi

`checkout.session.completed` (status paid) → incrémente transactionnellement
le doc `entries/{handle}` du montant payé. Un même handle qui paie deux fois =
top-up. Égalité de montants au classement : premier arrivé, premier rang.

## Accès nécessaires pour mettre en production

- Une clé Stripe (`sk_test_…` d'abord puis `sk_live_…`) — compte activé pour
  les paiements USD.
- Les ids GCP : billing account, folder, et le droit de créer un projet dans
  l'org (le state TF vit déjà dans `micro-sass-478507-tfstate`).
- Optionnel : le domaine (ex. flexwall.lol) et sa zone DNS pour le mapping.
