# 🐦 Plan de lancement X.com — flexwall.lol

> Objectif : transformer chaque entrée en contenu, chaque takeover en événement,
> chaque lecteur en entrant potentiel. Le produit EST un format X.

---

## 1. Analyse du terrain

### Pourquoi X est LE canal
- Le mur produit **du contenu natif** : classements, montants, drama de positions
- La culture **screenshot** : les cartes de partage circulent sans lien → zéro friction de spam
- **CT** (Crypto Twitter) et **build-in-public** = nos payeurs : habitués à prouver en public
- Précédent direct : outbid.lol → $139k en 65 h, diffusé par quote-tweets spontanés

### Segments cibles (ordre de conversion attendue)

| Segment | Motivation | Angle |
|---|---|---|
| CT degens | statut + gamble | "beat me" |
| Founders indie | marketing + flex | leur produit sur un mur public |
| Fintwit | positionnement expert | "the register" |
| Meme accounts | contenu gratuit | le drama des takeovers |

### Mécanique X qui nous favorise
- **Quote-tweet > like** : on ne demande pas un RT, on donne matière à QT ("il a vraiment payé pour ça")
- Les montants déclenchent le **doute** ("c'est vrai ?") → engagement
- Chaque takeover crée **deux camps** qui citent le même post

---

## 2. Setup avant lancement (J-2)

- [x] Vérifié : **@FLEXWALL est PRIS** (entreprise NL meubles 2010, dormante,
      8 followers, flexwall.nl) → utiliser **@flexwalllol** ou **@FlexWallHQ**
      (rachat possible mais contre les CGU de X : risqué)
- [ ] Créer la variante retenue + bio
- [ ] Bio : the open register of private fortunes · minimum rises as the wall fills · no refunds
- [ ] Épinglé : thread de lancement
- [ ] Avatar : carte #01 dorée (style ShareCard)
- [x] **Canal principal = ton compte perso @MickaelV79228** (déjà certifié ✓).
      Le compte marque sert uniquement à archiver les takeovers.

---

## 3. Semaine -1 : semer le mur (jamais de salle vide)

1. 5–8 entrées RÉELLES à $100 (toi + amis proches) dès HTTPS actif
2. 2 pseudos de caractère pour créer un premier rival visible (entrées payées, pas des bots)
3. Captures : podium peuplé, montants sérieux, étoiles ★ founders

> Budget total ~$500–800. C'est le coût d'acquisition de ta preuve sociale initiale.

---

## 4. Jour J : le thread (structure éprouvée)

**Timing** : mardi–jeudi, 15h–17h CET (= matin US East, double audience)

| # | Tweet | Contenu |
|---|---|---|
| 1 | Hook | EN: "People are paying real money to be ranked on a public leaderboard. Minimum $100. No refunds. The current #1 has $X on display." |
| 2 | Pourquoi | EN: "Anyone can talk about money. Almost nobody will put it on public display. Wealth whispered is an opinion. On the wall it's a fact with a timestamp." |
| 3 | Preuve | Capture du podium peuplé |
| 4 | Mécanique | EN: "Your rank IS your amount. Anyone can post more and take your spot. Passed today? You stay in history forever." |
| 5 | CTA + carte | Share card d'un entrant marquant + lien flexwall.lol |

**Règles d'or**
- Répondre à CHAQUE reply dans la première heure (signal algorithme)
- Pas de lien dans le tweet 1 (portée réduite) — lien dans bio et tweet 5
- Version FR du thread 24 h plus tard si traction EN

---

## 5. Mécanique continue (le moteur après J)

- **Alerte takeover** : watcher sur /api/board (diff toutes les 12 s) → dès qu'un rang change,
  @flexwall quote-tweet la carte avant/après. Chaque guerre devient une série.
- **Share cards** : chaque entrant repart avec son PNG → sa propre audience découvre le mur
- **DM ciblés** : 10–15 profils connus pour les paris publics/stunts (fondateurs bruyants,
  traders show-off, comptes meme finance). Message en 2 lignes + lien vers SA place :
  "#7 is yours for $X+1."
- **Rythme** : 1 tweet/jour minimum tant que le mur bouge (montants cumulés, nouveaux ★)

---

## 6. Mesures & critères de décision

| Signal | Où | Seuil d'alerte |
|---|---|---|
| Entrées / jour | Firestore (collection events) | < 5/jour après 72 h → changer le HOOK, pas le produit |
| Takeovers / semaine | events type=topup | < 2 → relancer un duel manuellement |
| Quote-tweets par entrée | manuel | — |

---

## 7. Risques & réponses préparées

| Risque | Réponse |
|---|---|
| "C'est un scam / vous gardez l'argent" | Rail de confiance + "we never touch your card, Stripe does. And it says NO REFUNDS everywhere." |
| Ratio négatif | Ne pas défendre — citer avec la capture d'un vrai takeover |
| Spam X (liens répétés) | Alterner cartes sans lien / threads / réponses |
| Noms offensants | Déjà prévu : §6 des règles (suppression sans remboursement) |

---

## Checklist finale

- [ ] Handle @flexwall sécurisé
- [ ] Mur semé (≥ 5 entrées)
- [ ] Thread écrit + captures prêtes
- [ ] Watcher takeover lancé
- [ ] Liste DM de 10 profils renseignée
