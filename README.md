# APIs Heal - French Public APIs MCP Server

Serveur MCP (Model Context Protocol) exposant les APIs publiques françaises pour le secteur BTP et la construction.

## 🎯 Fonctionnalités

Ce serveur MCP fournit un accès unifié à plusieurs APIs publiques françaises :

- **BOAMP** : Marchés publics et appels d'offres
- **Géorisques** : Risques naturels et technologiques
- **Cadastre** : Parcelles cadastrales
- **Urbanisme** : PLU, zonages et servitudes
- **Base Carbone ADEME** : Facteurs d'émission carbone
- **Légifrance** : Textes juridiques (OAuth2 requis)
- **BAN** : Géocodage d'adresses

## 📋 Prérequis

- Node.js 20+
- npm ou yarn

## 🚀 Installation

```bash
# Cloner le repository
git clone <repository-url>
cd apis-heal

# Installer les dépendances
npm install

# Copier le fichier d'environnement
cp .env.example .env

# Éditer .env avec vos paramètres
```

## ⚙️ Configuration

Créez un fichier `.env` à la racine du projet :

```env
PORT=3100
NODE_ENV=development
LOG_LEVEL=info
REQUEST_TIMEOUT=30000
MAX_REQUEST_SIZE=10mb

# Optionnel : Légifrance OAuth2 (inscription sur https://piste.gouv.fr)
LEGIFRANCE_CLIENT_ID=
LEGIFRANCE_CLIENT_SECRET=
```

### Variables d'environnement

| Variable | Description | Défaut | Requis |
|----------|-------------|--------|--------|
| `PORT` | Port d'écoute du serveur | 3100 | Non |
| `NODE_ENV` | Environnement (development/production/test) | development | Non |
| `LOG_LEVEL` | Niveau de log (debug/info/warn/error) | info | Non |
| `REQUEST_TIMEOUT` | Timeout des requêtes HTTP en ms | 30000 | Non |
| `MAX_REQUEST_SIZE` | Taille max des requêtes | 10mb | Non |
| `LEGIFRANCE_CLIENT_ID` | Client ID OAuth2 PISTE | - | Non* |
| `LEGIFRANCE_CLIENT_SECRET` | Client Secret OAuth2 PISTE | - | Non* |

*Requis uniquement pour utiliser les outils Légifrance

## 🏃 Utilisation

### Développement

```bash
npm run dev
```

### Production

```bash
# Build
npm run build

# Démarrer
npm start
```

### Docker

```bash
# Build l'image
docker build -t apis-heal .

# Lancer le conteneur
docker run -p 3100:3100 --env-file .env apis-heal
```

## 📡 Endpoints

### Health Check

```bash
GET /health
```

Retourne le statut du serveur.

### MCP Endpoint

```bash
POST /mcp
Content-Type: application/json
```

Endpoint principal pour les requêtes MCP.

## 🛠️ Outils disponibles

### Géocodage

- `geocoder_adresse` : Convertit une adresse en coordonnées GPS

### BOAMP (Marchés publics)

- `boamp_search_marches` : Recherche de marchés publics
- `boamp_get_marche` : Détail d'un marché
- `boamp_veille_btp_normandie` : Veille BTP Normandie

### Géorisques

- `georisques_rapport_risques` : Rapport complet des risques
- `georisques_seisme` : Classification sismique
- `georisques_argiles` : Risque retrait-gonflement argiles
- `georisques_cavites` : Cavités souterraines

### Cadastre

- `cadastre_parcelle` : Parcelle par référence cadastrale
- `cadastre_parcelle_coords` : Parcelle par coordonnées GPS

### Urbanisme

- `urbanisme_zonage_plu` : Zonage PLU/PLUi
- `urbanisme_servitudes` : Servitudes d'utilité publique

### Base Carbone

- `carbone_search_materiaux` : Recherche facteurs d'émission
- `carbone_facteur_emission` : Facteur d'émission précis

### Légifrance (OAuth2 requis)

- `legifrance_search` : Recherche textes juridiques
- `legifrance_article_code` : Article précis d'un code

## 🔒 Sécurité

- Validation des variables d'environnement au démarrage
- Timeout configuré sur toutes les requêtes HTTP
- Limite de taille des requêtes
- Logging structuré
- Gestion d'erreurs robuste
- Graceful shutdown

## 📝 Logs

Les logs sont au format JSON structuré :

```json
{
  "timestamp": "2024-01-01T12:00:00.000Z",
  "level": "info",
  "message": "Server started",
  "port": 3100,
  "environment": "production"
}
```

Niveaux de log : `debug`, `info`, `warn`, `error`

## 🧪 Tests

```bash
# Tests unitaires (à venir)
npm test

# Tests d'intégration (à venir)
npm run test:integration
```

## 📦 Structure du projet

```
apis-heal/
├── src/
│   ├── server.ts           # Point d'entrée
│   ├── tools/              # Outils MCP par API
│   │   ├── boamp.ts
│   │   ├── georisques.ts
│   │   ├── cadastre.ts
│   │   ├── urbanisme.ts
│   │   ├── base-carbone.ts
│   │   └── legifrance.ts
│   └── utils/              # Utilitaires
│       ├── config.ts       # Configuration
│       ├── logger.ts       # Logging
│       ├── fetch.ts        # HTTP client
│       ├── formatters.ts   # Formatage
│       ├── geocode.ts      # Géocodage
│       └── oauth.ts        # OAuth2
├── Dockerfile
├── package.json
├── tsconfig.json
└── README.md
```

## 🤝 Contribution

Les contributions sont les bienvenues ! Merci de :

1. Fork le projet
2. Créer une branche (`git checkout -b feature/amelioration`)
3. Commit vos changements (`git commit -am 'Ajout fonctionnalité'`)
4. Push vers la branche (`git push origin feature/amelioration`)
5. Créer une Pull Request

## 📄 Licence

Ce projet est sous licence privée.

## 🔗 Liens utiles

- [BOAMP API](https://boamp-datadila.opendatasoft.com/)
- [Géorisques API](https://www.georisques.gouv.fr/api)
- [API Carto (Cadastre/Urbanisme)](https://apicarto.ign.fr/)
- [Base Carbone ADEME](https://data.ademe.fr/)
- [Légifrance PISTE](https://piste.gouv.fr/)
- [Base Adresse Nationale](https://adresse.data.gouv.fr/)
- [Model Context Protocol](https://modelcontextprotocol.io/)

## 📞 Support

Pour toute question ou problème, ouvrez une issue sur GitHub.
