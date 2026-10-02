# Tâches ménagères — multi-foyers

Petite app de gestion des tâches ménagères, avec plusieurs foyers isolés
les uns des autres et un espace développeur pour tout superviser.

## Comment c'est construit (pour comprendre le code)

- **`public/`** : le frontend. Fichiers statiques purs (HTML/CSS/JS),
  aucun framework. `app.js` fait des `fetch()` vers `/api/...`.
- **`netlify/functions/api.js`** : le backend. Une seule "fonction serverless"
  Node.js qui gère toutes les routes selon le chemin et la méthode HTTP
  (un peu comme un mini-Express fait à la main).
- **Appwrite Databases** : le backend stocke un document JSON par clé dans
  une base et une collection Appwrite créées automatiquement au premier appel.
- **`netlify.toml`** : dit à Netlify où sont le site statique et les
  fonctions, et redirige `/api/*` vers la fonction.

### Comment sont protégées les données

- Chaque responsable a un code PIN **haché** (jamais stocké ni renvoyé en
  clair — voir `hashPin`/`verifyPin` dans `api.js`, avec `crypto.scryptSync`).
- Après connexion, le serveur délivre un **jeton de session** aléatoire.
  Ce jeton doit être présenté (`Authorization: Bearer ...`) pour toute
  action réservée aux responsables — le serveur vérifie le rôle à chaque
  requête, pas seulement côté écran.
- Le mot de passe de l'espace développeur n'est **jamais dans le code** :
  il vit dans une variable d'environnement (`DEV_PASSWORD`) que toi seul
  configures sur Netlify.

C'est un vrai progrès de sécurité par rapport à une version 100% front :
les codes PIN ne quittent jamais le serveur en clair.

## Déployer sur Netlify

### 1. Mets le projet sur GitHub (le plus simple)
- Crée un nouveau dépôt sur GitHub.
- Pousse tous les fichiers de ce dossier dedans (`git init`, `git add .`,
  `git commit`, `git remote add origin ...`, `git push`).

### 2. Connecte le dépôt à Netlify
- Sur [app.netlify.com](https://app.netlify.com), clique **"Add new site" →
  "Import an existing project"**.
- Choisis GitHub, autorise l'accès, sélectionne ton dépôt.
- Netlify détecte `netlify.toml` automatiquement (dossier `public` à
  publier, fonctions dans `netlify/functions`). Laisse les réglages par
  défaut et clique **"Deploy"**.

### 3. Configure le mot de passe développeur
- Une fois le site créé : **Site settings → Environment variables →
  Add a variable**.
  - Clé : `DEV_PASSWORD`
  - Valeur : le mot de passe de ton choix
- Redéploie le site (Deploys → Trigger deploy) pour que la variable soit
  prise en compte.

### 4. Configure Appwrite dans Netlify
Dans **Site configuration → Environment variables**, ajoute :

- `APPWRITE_ENDPOINT` = `https://fra.cloud.appwrite.io/v1`
- `APPWRITE_PROJECT_ID` = l'identifiant du projet Appwrite
- `APPWRITE_API_KEY` = la clé API serveur, jamais exposée au frontend

Les variables facultatives `APPWRITE_DATABASE_ID` et
`APPWRITE_COLLECTION_ID` peuvent rester absentes : les valeurs
`foyer-taches` seront utilisées. La base, la collection et l'attribut `data`
sont initialisés automatiquement au premier appel. La clé API doit avoir les
permissions serveur Databases nécessaires.

### 5. Teste
Ouvre l'URL que Netlify t'a donnée (ex. `https://ton-site.netlify.app`).
Crée un foyer, note le code généré, essaie de le rejoindre depuis un
autre appareil ou un onglet privé.

## Tester en local avant de déployer (optionnel, pour t'entraîner)

```bash
npm install -g netlify-cli
cd ce-dossier
npm install
netlify dev
```
`netlify dev` lance le site + les fonctions localement sur
`http://localhost:8888`. En local, les mêmes variables Appwrite doivent être
présentes dans l'environnement du terminal.

## Limites à connaître

- Pas de limite de débit (rate limiting) sur les tentatives de PIN — pour
  un usage familial ce n'est pas critique, mais dans un vrai produit il
  faudrait bloquer après plusieurs échecs.
- Les jetons de session n'expirent jamais automatiquement dans cette
  version simple (pas de déconnexion forcée après X jours).
- Pas d'e-mail de récupération si un responsable oublie son code — il
  faut qu'un autre responsable du même foyer le réinitialise, ou toi
  via l'espace développeur (suppression du foyer).
