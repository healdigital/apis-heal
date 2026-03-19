# Changelog

Toutes les modifications notables de ce projet seront documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

## [0.2.0] - 2024-01-XX

### Ajouté
- Validation des variables d'environnement au démarrage avec Zod
- Timeout configuré sur toutes les requêtes HTTP (30s par défaut)
- Logging structuré au format JSON avec niveaux configurables
- Utilitaire de formatage pour réduire la duplication de code
- Gestion d'erreurs améliorée et cohérente
- Graceful shutdown sur SIGTERM et SIGINT
- Middleware de logging des requêtes
- Handler 404 pour les routes non trouvées
- Handler d'erreurs global
- Configuration ESLint et Prettier
- Documentation complète dans README.md
- CHANGELOG.md pour suivre les modifications
- Scripts npm pour lint, format et type-check

### Modifié
- Refactorisation du client HTTP avec timeout et gestion d'erreurs
- Amélioration de la gestion OAuth2 avec logging
- Suppression des assertions non-null (`!`) dangereuses
- Amélioration du formatage des résultats BOAMP
- Configuration Docker optimisée
- Variables d'environnement étendues (.env.example)

### Sécurité
- Limite de taille des requêtes configurée (10mb par défaut)
- Validation stricte de la configuration
- Meilleure gestion des erreurs sensibles en production
- Timeout sur toutes les requêtes externes

## [0.1.0] - 2024-01-XX

### Ajouté
- Serveur MCP initial avec Express
- Intégration BOAMP (marchés publics)
- Intégration Géorisques (risques naturels)
- Intégration Cadastre (parcelles)
- Intégration Urbanisme (PLU/servitudes)
- Intégration Base Carbone ADEME
- Intégration Légifrance (OAuth2)
- Géocodage avec BAN
- Configuration Docker
- TypeScript strict mode
