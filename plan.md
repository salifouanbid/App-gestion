# Refonte internat multi-bâtiments

## Objectif
Faire évoluer l'application de gestion de tâches par foyer vers un espace d'internat composé de plusieurs bâtiments, avec des bâtiments privés/non communs et des bâtiments communs à nettoyer.

## Règles fonctionnelles retenues

- L'internat contient plusieurs bâtiments.
- L'administrateur crée les bâtiments et indique pour chacun s'il est commun.
- Chaque personne appartient à un bâtiment non commun.
- Chaque bâtiment possède sa propre liste de tâches.
- Les tâches d'un bâtiment sont normalement attribuées aux personnes de ce bâtiment.
- Les bâtiments communs sont nettoyés par des personnes provenant des bâtiments non communs.
- Une tâche commune est attribuée à une seule personne.
- La répartition commune fonctionne par rotation hebdomadaire.
- Une personne affectée à une tâche commune ne reçoit pas de tâche automatique de son bâtiment d'origine la même semaine.
- Une affectation manuelle rend la personne non éligible aux autres affectations automatiques de la même répartition.
- Si un bâtiment non commun a un déficit de personnes par rapport au nombre de tâches de son propre bâtiment, il ne participe pas à la rotation commune chaque semaine : une personne de ce bâtiment participe au nettoyage commun une fois par mois, sur la première semaine du mois.
- Les bâtiments non déficitaires prennent les affectations communes restantes lorsque nécessaire.
- L'administrateur peut ajouter, modifier, supprimer et affecter manuellement les tâches, gérer les personnes, les bâtiments et les absences.
- Les résidents peuvent consulter leurs tâches et les marquer comme terminées.
- Une validation sans photo est privilégiée : le résident déclare la tâche terminée, puis le responsable la valide ou la renvoie à refaire.
- L'interface doit rester utilisable sur téléphone avec une seule colonne, des formulaires empilés et des actions adaptées au tactile.

## Modèle de données

Le document Appwrite du foyer est conservé pour compatibilité et reçoit les champs suivants :

- `buildings`: `{ id, name, common }[]`.
- `persons`: `{ id, name, color, present, buildingId }[]`.
- `tasks`: `{ id, text, buildingId, assigneeId, assignmentMode, completed }[]`, où `assignmentMode` vaut `manual` ou `auto`.
- `history`: entrées de répartition avec semaine, affectations, bâtiment d'origine, bâtiment cible et mode.
- `rotationOffset`: index de rotation global conservé pour les anciennes données.
- `weeklyRotation`: `{ key, indexByBuilding }` pour stabiliser la rotation par semaine et par bâtiment.

Les foyers existants sont migrés à la lecture : un bâtiment par défaut est créé si nécessaire et les personnes/tâches historiques y sont rattachées.

## Backend

- Ajouter les routes de gestion des bâtiments.
- Étendre les routes personnes et tâches avec `buildingId`.
- Remplacer la répartition uniforme actuelle par un planificateur hebdomadaire déterministe.
- Les tâches déjà affectées manuellement ou déjà complétées ne sont pas remplacées par la répartition automatique.
- Une personne ayant une tâche manuelle n'est pas éligible à une affectation automatique dans la même exécution.
- Produire une entrée d'historique détaillée et explicite.

## Frontend

- Remplacer les libellés « foyer » par des libellés adaptés à l'internat, sans casser les anciens codes d'accès.
- Ajouter une section « Bâtiments » réservée à l'administrateur : nom, bâtiment commun/non commun, suppression protégée si des membres ou tâches y sont rattachés.
- Ajouter le bâtiment lors de l'ajout d'une personne.
- Ajouter le bâtiment cible lors de la création d'une tâche.
- Afficher les tâches regroupées par bâtiment, avec badges « manuel », « automatique » et « commun ».
- Ajouter un résumé de la semaine courante : affectations communes, bâtiments déficitaires et personnes exemptées.
- Conserver la gestion des absences, des responsables, du PIN et de l'historique.

## Design

Trois directions possibles :

1. **Tableau de permanence** (0,07) — panneaux par bâtiment et repères de rotation très lisibles.
2. **Carnet d'internat** (0,05) — sections éditoriales, codes couleur sobres et historique mis en avant.
3. **Centre de coordination** (0,08) — interface plus opérationnelle, badges d'état et résumé hebdomadaire.

Choix : **Tableau de permanence**.

- Mouvement : tableau de service clair, inspiré des plannings affichés dans un internat.
- Principes : lisibilité immédiate, distinction nette commun/non commun, état visible, actions administrateur regroupées.
- Palette : vert sauge pour le service normal, ocre pour la rotation, rouge discret pour les déficits et actions dangereuses.
- Mise en page : résumé hebdomadaire en tête, puis une colonne/section par bâtiment, sans cacher les exceptions.
- Éléments signature : badge « commun », bandeau « semaine », ligne d'affectation avec bâtiment d'origine.
- Interaction : une affectation manuelle est explicitement marquée et verrouille l'éligibilité automatique de la personne.
- Animation : minimale, uniquement transitions d'état pour ne pas distraire d'un outil de planning.
- Typographie : système sans-serif pour les données, Georgia pour les titres déjà présents.
- Voix : pratique, directe, adaptée à la coordination quotidienne d'un internat.

## Structure du projet

- `public/app.js`: écrans, formulaires, regroupement et résumé des bâtiments.
- `public/style.css`: cartes de bâtiments, badges de statut, résumé hebdomadaire.
- `netlify/functions/api.js`: migration de données, routes et algorithme de rotation.
- `README.md`: documentation du modèle internat et des règles de répartition.

## Première amélioration validée

- Remplacer la validation immédiate par un cycle `attribuée → déclarée terminée → validée / à refaire`.
- Conserver `completed` pour la compatibilité des anciennes données et ajouter un statut de validation optionnel.
- Corriger les incohérences de rendu et adapter les tâches, formulaires, bâtiments et historique aux petits écrans.
