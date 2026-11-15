# TODO — Internat multi-bâtiments

## 1. Bâtiments et migration
- [ ] L'administrateur peut créer plusieurs bâtiments et indiquer pour chacun s'il est commun ou non.
- [ ] Les foyers existants sont migrés automatiquement vers un bâtiment non commun par défaut.
- [ ] Un bâtiment ne peut pas être supprimé s'il contient encore des personnes ou des tâches sans réaffectation explicite.

## 2. Personnes
- [ ] Chaque personne ajoutée doit être rattachée à un bâtiment non commun.
- [ ] L'administrateur peut changer le bâtiment d'une personne.
- [ ] Les personnes absentes sont exclues des affectations automatiques.

## 3. Tâches par bâtiment
- [ ] L'administrateur peut créer une tâche pour un bâtiment précis.
- [ ] Une tâche peut être affectée manuellement à une personne.
- [ ] Une personne ayant reçu une tâche manuelle n'est plus éligible aux autres tâches automatiques de la même répartition.
- [ ] Les tâches sont affichées par bâtiment, avec leur état et leur mode d'affectation.

## 4. Rotation hebdomadaire
- [ ] Les tâches non communes sont attribuées automatiquement aux personnes présentes de leur bâtiment.
- [ ] Chaque tâche d'un bâtiment commun est attribuée à une seule personne issue d'un bâtiment non commun.
- [ ] La rotation change chaque semaine.
- [ ] Une personne affectée à un bâtiment commun ne reçoit plus de tâche automatique dans son bâtiment d'origine la même semaine.
- [ ] En cas de déficit de personnes dans un bâtiment par rapport à ses propres tâches, ce bâtiment participe au nettoyage commun une fois par mois, pendant la première semaine du mois.
- [ ] Les autres bâtiments non déficitaires absorbent les affectations communes restantes lorsque nécessaire.
- [ ] L'historique expose la semaine, le bâtiment d'origine, le bâtiment nettoyé et le mode d'affectation.

## 5. Contrôle administrateur
- [ ] L'administrateur peut affecter manuellement une tâche, modifier une affectation et relancer la répartition.
- [ ] L'administrateur peut gérer les bâtiments, les personnes, les tâches et les absences.
- [ ] Un résumé de la semaine présente les affectations communes et les bâtiments déficitaires.

## 6. Compatibilité et sécurité
- [ ] Les anciens codes d'accès et responsables continuent de fonctionner.
- [ ] Les PIN restent hachés et les secrets restent uniquement dans les variables Netlify.
- [ ] Les routes existantes de connexion, lecture et validation des tâches restent compatibles.

## 7. Validation sans photo et mobile
- [ ] Un résident peut déclarer une tâche terminée sans envoyer de photo.
- [ ] Un responsable peut valider la déclaration ou la renvoyer « à refaire ».
- [ ] Les anciennes tâches `completed` restent considérées comme validées.
- [ ] Sur téléphone, les formulaires, tâches, bâtiments et historiques restent lisibles sans défilement horizontal.
- [ ] Les contrôles tactiles restent accessibles et la section principale ne plante pas à cause d'un champ inexistant.
- [ ] La déclaration d'une tâche accepte un commentaire facultatif.
- [ ] Le commentaire est visible au responsable lors de la vérification.
- [ ] Un responsable peut être rattaché à un bâtiment.
- [ ] Un responsable rattaché à un bâtiment ne peut valider ou refuser que les tâches de ce bâtiment.
