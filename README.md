# eCF-SaaS

SaaS de Facturación Electrónica para República Dominicana (Ley 32-23)

## Inicio Rápido

```bash
npm install --legacy-peer-deps
docker-compose up -d
npm run build
npm run dev
```

Accede a:
- **API**: http://localhost:3000/api/health
- **Swagger**: http://localhost:3000/api/docs
- **pgAdmin**: http://localhost:5050 (admin@example.com / admin)
- **Redis**: localhost:6379

## Estructura

```
src/
├── auth/          # Autenticación JWT
├── ecf/           # Facturas Electrónicas
├── validation/    # Validación XSD
├── dgii/          # DGII Integration
└── common/        # Código compartido
```

## Comandos

- `npm run dev` - Desarrollo (hot-reload)
- `npm test` - Tests
- `npm run build` - Compilar
- `docker-compose up -d` - Iniciar servicios
- `docker-compose down` - Detener servicios
