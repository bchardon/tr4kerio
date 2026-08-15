# TR4KERIO

Addon Nuvio et Stremio minimal pour interroger l’API Torznab de TR4KER, filtrer les résultats par qualité et les trier automatiquement.

<img width="600" height="541" alt="Screenshot_2026-08-07_18-26-23" src="https://github.com/user-attachments/assets/1aa7a43d-2737-4115-abd3-4eab08b9bba7" />


## Fonctions

- Page web de configuration
- Filtre 4K, 1080p, 720p ou toutes qualités
- Identifiants IMDb et TMDB compatibles
- Résolution du titre des séries IMDb via Cinemeta pour la recherche Torznab
- Filtrage local des épisodes et sélection du bon fichier dans les packs de saison
- Détection REMUX, BluRay, WEB-DL, WEBRip, HDR, Dolby Vision, codecs, audio et langues
- Tri par seeders puis qualité de source
- Déduplication par infohash
- Docker et Docker Compose pour déploiement 

## Démarrage local

```bash
npm install
npm start
```

Ouvrir `http://localhost:7000`.

## Docker

Vérifier les variables d’environnement dans `docker-compose.yml`, notamment
`TORZNAB_URL` et `TRACKER_PROXY_URL`, puis lancer :

```bash
docker compose up -d --build --remove-orphans
```

## Reverse proxy

Le domaine public doit utiliser HTTPS et transmettre les requêtes ordinaires au
port 7000 de l’addon. `TRACKER_PROXY_URL` désigne le relais tracker HTTPS.

Avec la valeur suivante :

```yaml
TRACKER_PROXY_URL: https://tr4ker.monsite.com/tracker
```

le reverse proxy doit :

- transmettre l’addon à `tr4kerio:7000` ;
- retirer le préfixe `/tracker` avant de contacter `https://tk.tr4ker.net` ;
- ajouter `left=1` lorsqu'un client omet complètement ce paramètre ;
- remplacer uniquement `left=18446744073709551615` par `left=1`, valeur envoyée
  temporairement par TorrServer tant que les métadonnées sont inconnues ;
- ne pas enregistrer les requêtes `/tracker/*`, car leur chemin contient le
  passkey privé du tracker.

Si le reverse proxy ne partage pas le réseau Docker de l’addon, remplacer
`tr4kerio:7000` par l’adresse réellement accessible, par exemple
`127.0.0.1:7000` si le port est publié localement.

### Caddy

Caddy obtient et renouvelle automatiquement le certificat TLS du domaine de
l’addon :

```caddyfile
tr4ker.monsite.com {
    @missingLeft not query left=*

    handle_path /tracker/* {
        log_skip

        # Certains clients omettent left pendant la première annonce.
        uri @missingLeft query +left 1

        # TorrServer utilise cette valeur avant de connaître la taille du torrent.
        uri query left ^18446744073709551615$ 1

        reverse_proxy https://tk.tr4ker.net {
            header_up Host tk.tr4ker.net
        }
    }

    handle {
        reverse_proxy tr4kerio:7000
    }
}
```

Valider puis recharger la configuration :

```bash
caddy validate --config /etc/caddy/Caddyfile
caddy reload --config /etc/caddy/Caddyfile
```

Dans Docker, les mêmes commandes peuvent être lancées avec
`docker exec caddy caddy ...`.

### Nginx

Le bloc `map` doit être placé dans le contexte `http` de Nginx, généralement
dans `nginx.conf` ou dans un fichier inclus depuis celui-ci. Il permet de
modifier `left` sans supprimer les autres paramètres de l’annonce :

```nginx
map $args $tr4ker_tracker_args {
    default $args;

    ~^left=18446744073709551615(?<tr4ker_tail>&.*)?$
        "left=1${tr4ker_tail}";

    ~^(?<tr4ker_head>.*&)left=18446744073709551615(?<tr4ker_rest>&.*)?$
        "${tr4ker_head}left=1${tr4ker_rest}";
}

# Ajoute left=1 uniquement s'il reste absent après la normalisation précédente.
map $tr4ker_tracker_args $tr4ker_final_tracker_args {
    "" "left=1";
    ~(^|&)left= $tr4ker_tracker_args;
    default "$tr4ker_tracker_args&left=1";
}

server {
    listen 80;
    server_name tr4ker.monsite.com;

    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name tr4ker.monsite.com;

    ssl_certificate /etc/letsencrypt/live/tr4ker.monsite.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tr4ker.monsite.com/privkey.pem;

    location ^~ /tracker/ {
        access_log off;

        set $args $tr4ker_final_tracker_args;
        proxy_pass https://tk.tr4ker.net/;
        proxy_ssl_server_name on;
        proxy_ssl_name tk.tr4ker.net;
        proxy_set_header Host tk.tr4ker.net;
    }

    location / {
        proxy_pass http://tr4kerio:7000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Adapter les chemins des certificats si nécessaire, puis vérifier la
configuration avant son rechargement :

```bash
nginx -t
nginx -s reload
```

## Installation

1. Ouvrir `https://tr4ker.monsite.com`.
2. Saisir la clé API.
3. Choisir la qualité.
4. Cliquer sur **Installer via HTTPS**.

Le bouton génère un lien `stremio://`, reconnu par Stremio comme par Nuvio.

La configuration produit une URL de la forme :

```text
https://tr4ker.monsite.com/CLE_API/1080p/https/manifest.json
```

Cette URL contient la clé API. Elle doit rester privée.

## Sécurité

- Ne jamais committer une clé API.
- Servir l'addon et sa page de configuration exclusivement en HTTPS.
- Toute personne possédant l’URL du manifest peut voir la clé API.
- Pour une installation publique, préférer à terme un stockage chiffré avec identifiant de configuration opaque.

Utiliser uniquement avec des contenus auxquels vous avez légalement accès.
