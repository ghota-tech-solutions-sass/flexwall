# OUTFLEX.LOL — « Poste ton argent. Prends ton rang. »

## 1. Le concept en une phrase

Outbid.lol vend des classements pour des **produits**. Nous, on supprime le produit :
les gens paient pour afficher **leur argent directement**, et le site les trie du plus riche
au moins riche. Une liste publique, payante, et **réservée aux riches**.

> Tagline : « No products. No pitches. Just money. »
> FR : « Pas de produit. Pas de pitch. Que du fric. »

## 2. Pourquoi ça peut marcher (ce que prouve outbid.lol)

- Outbid a fait **200k+ visiteurs et ~$21,5k de revenus en 24h**, avec zéro produit,
  juste un leaderboard pay-to-rank (chiffres annoncés par son fondateur sur X).
- La mécanique virale n'est pas « acheter un truc », c'est **le statut** : les gens adorent
  voir et montrer des classements où ils gagnent.
- Les clones (outbid.fyi etc.) confirment que la formule est copiable — il faut un **angle fort
  et immédiatement compréhensible**. Le nôtre : « et si le produit, c'était juste l'argent ? ».
  Ça se résume en un tweet.

Notre twist ajoute trois ressorts qu'outbid n'a pas :

1. **L'exclusion** : tout le monde ne peut pas entrer (minimum $1 000). L'envie fait le trafic.
2. **La personne, pas la marque** : on classe des humains (@handles), pas des SaaS. Le drame est plus fort.
3. **La métrique ultime** : « $XX M actuellement exposés sur le mur » — un compteur d'argent
   qui monte en direct est du contenu X à lui tout seul.

## 3. Mécaniques de jeu (règles)

1. Tu postes une somme (paiement réel via Stripe). Elle s'affiche à ton @handle.
2. Ton rang = ta somme. Plus tu mets, plus tu montes. Égalité : le premier arrivé reste devant.
3. Quelqu'un poste plus que toi ? Il te passe. Trois options : **top-upper** (ré-up),
   **cope-r**, ou fermer l'onglet.
4. L'argent affiché reste sur le mur. Il n'achète rien, il ne sert à rien. C'est le principe.
5. Tout est public : ton montant, ta chute, ton historique.

### Le mur anti-pauvre (la gate)

- **Minimum d'entrée : $1 000.** Message si dessous :
  « Access denied. The minimum is $1,000. Come back when the number has four digits. »
- Paliers visibles sur le board (filtres) :
  - 👑 **Seven figures+** ($1M+) — « The Vault »
  - 💎 **Six figures** ($100k–$1M)
  - 🥂 **Five figures** ($10k–$100k)
  - 🚪 **Four figures** ($1k–$10k) — « the lobby »

### Claimed vs Verified (la confiance)

- Badge gris **CLAIMED** : montant payé, identité non vérifiée (par défaut).
- Badge or **VERIFIED** : lecture en lecture seule d'un compte bancaire/broker (type Plaid)
  ou preuve de fonds — frais unique de $99. L'argent parle quand même (pas de tri spécial),
  mais le badge nourrit le flex et crée un 2e flux de revenus.

## 4. Monétisation (c'est l'argent posté lui-même)

| Flux | Mécanique |
|---|---|
| Entrée | La somme postée = revenu (modèle outbid, ticket moyen plus haut grâce à la gate) |
| Ré-up | Chaque top-up pour reprendre/monter un rang |
| Vérification | Frais fixe $99 pour le badge VERIFIED |
| Hall of Fame | Fin de saison : $199 pour figurer en permanence au palmarès |

Option PR (bouclier éthique) : case « donate 50% to charity on season end » → badge 💚
et amortissement des critiques « c'est de l'argent brûlé ».

## 5. Boucle virale X (playbook de lancement)

1. **Teaser** sous les tweets viraux d'outbid.lol : « cool. now imagine there was no product.
   just money on a wall. coming tonight. »
2. **Cartes de partage auto-générées** : « I'm #7 on outflex.lol with $1,2M on display. Beat me. »
   (canvas → PNG 1200×630 — déjà dans le prototype).
3. **Carte de défaite** : quand on te dépasse : « You've been out-flexed by @x » —
   les perdants partagent aussi, et ce sont eux qui ramènent du trafic.
4. **Compteur d'exposition** : « $23,4M currently rotting on our leaderboard ».
5. **Saisons mensuelles** : reset, couronne permanente 👑 pour le #1 — relance la guerre chaque mois.
6. Ciblage : finance twitter, crypto twitter, founders — des publics qui aiment se comparer.

## 6. V1 vs V2

**V1 (le prototype)** : mur public, gate $1k, filtres par palier, claim flow,
feed d'activité live, bots de démo pour rendre le mur vivant, carte de partage.

**V2 (si traction)** : Stripe réel + webhooks, badges VERIFIED (Plaid), cartes de défaite,
saisons + Hall of Fame, défis 1v1 (« out-flex @x »), widget X embarquable, page profil
avec historique des chutes (« downfall timeline » — le contenu préféré de X).

## 7. Risques & parades

- **« C'est de l'argent brûlé »** → ton assumé (« oui, et alors »), transparence sur les fonds,
  option don caritatif. Le site ne promet rien d'autre qu'un rang.
- **Régulation / jeu d'argent ?** → aucun gain, aucun tirage : achat de visibilité,
  même statut qu'outbid.lol. Pas de mécanique de loterie.
- **Faux montants** → impossible côté payé (l'argent est réel). Un board « CLAIMED » gratuit
  (auto-déclaré) peut exister séparément pour le drama, clairement marqué.
- **Churn après le hype** → saisons mensuelles + défis 1v1 pour recycler la compétition.

## 8. Noms alternatifs

- **outflex.lol** ⭐ (recommandé — se lit tout seul par la foule d'outbid)
- richest.lol · flexbook.lol · thevault.lol · brag.lol · networth.gg

## 9. Le prototype

index.html (un seul fichier, aucune dépendance) reproduit le mur complet : gate $1 000,
paliers, leaderboard trié par fortune, activité live simulée, compteur d'argent exposé,
génération de carte de partage pour X. Ouvrir le fichier directement dans un navigateur.


---

## ADDENDUM — Repositionnement v2 : « The Open Register of Private Fortunes »

Décision produit : **ne pas surfer sur la vague outbid** (produits, enchères) mais créer
une catégorie distincte — **le registre public des fortunes, ouvert à tous**.

| Ancien (vague outbid) | Nouveau (institution) |
|---|---|
| « Claim your rank » | « Enter the list » |
| « Post your money » | « Declare my fortune » |
| « out-flex » | « surpass » |
| ton arcade / cope | ton registre : « Your entry fee is your proof » |
| référence explicite à outbid | zéro mention — catégorie propre |

**Pitch standalone** : « Forbes ranks the fortunes it can verify. We rank the ones
brave enough to show. No editors. No gatekeepers. Entry minimum $1,000. »

**Distribution sans la vague** : le contenu « liste de richesse » est nativement viral
(les listes Forbes font des pics de trafic annuels sans mème préalable) ; le format
screenshot du mur + watermark fait le reste ; angle FR possible plus tard
(« la première liste des fortunes ouverte », médias FR adorent les formats US).

**Durabilité** : fini les saisons éphémères — on construit une institution annuelle.
Le registre garde l'historique : entrées, chutes, reconquêtes (« downfall timeline »).

