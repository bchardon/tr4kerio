# TR4KERIO

Addon Stremio minimal pour interroger l’API Torznab de TR4KER, filtrer les résultats par qualité et les trier automatiquement.

## Fonctions

- Page web de configuration
- Icône TR4KERIO personnalisée
- Clé API TR4KER par utilisateur
- Filtre 4K, 1080p, 720p ou toutes qualités
- Films via `t=movie`
- Séries via `t=tvsearch&q=...&season=...`, puis filtrage local de l’épisode
- Identifiants IMDb et TMDB compatibles
- Résolution du titre des séries IMDb via Cinemeta pour la recherche Torznab
- Filtrage local des épisodes et sélection du bon fichier dans les packs de saison
- Détection REMUX, BluRay, WEB-DL, WEBRip, HDR, Dolby Vision, codecs, audio et langues
- Tri par seeders puis qualité de source
- Déduplication par infohash
- Docker et Docker Compose

## Démarrage local

```bash
npm install
npm start
```

Ouvrir `http://localhost:7000`.

## Docker

Vérifier les variables d’environnement dans `docker-compose.yml`, notamment
`TORZNAB_URL`, puis lancer :

```bash
docker compose up -d --build --remove-orphans
```

## Reverse proxy

Le domaine public doit pointer vers le port 7000 du conteneur et utiliser HTTPS. Exemple Nginx :

```nginx
server {
    server_name tr4ker.monsite.ch;

    location / {
        proxy_pass http://127.0.0.1:7000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Gérer le certificat TLS avec Certbot ou le proxy déjà présent sur le VPS.

## Installation Stremio

1. Ouvrir `https://tr4ker.monsite.ch`.
2. Saisir la clé API.
3. Choisir la qualité.
4. Cliquer sur **Installer dans Stremio**.

La configuration produit une URL de la forme :

```text
https://tr4ker.monsite.ch/CLE_API/1080p/manifest.json
```

Cette URL contient la clé API. Elle doit rester privée.

## Sécurité

- Ne jamais committer une clé API.
- Utiliser exclusivement HTTPS.
- Toute personne possédant l’URL du manifest peut voir la clé API.
- Pour une installation publique, préférer à terme un stockage chiffré avec identifiant de configuration opaque.

Utiliser uniquement avec des contenus auxquels vous avez légalement accès.
