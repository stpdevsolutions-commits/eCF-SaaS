# eCF-SaaS

SaaS de Facturación Electrónica para República Dominicana (Ley 32-23). Permite crear comprobantes fiscales electrónicos (e-CF), generar su XML según los esquemas de la DGII, firmarlos digitalmente (XMLDSig) y gestionar su ciclo de vida completo frente a la DGII (transmisión, consulta de estado y cancelación), con retenciones ISR/ITBIS y reportes.

## Estado

**Ciclo de vida completo del e-CF implementado y verificado** (integración DGII en modo *mock* en desarrollo):

```
draft → validated → signed → transmitted → accepted / rejected → cancelled
```

- Generación de XML para los 10 tipos de e-CF (31, 32, 33, 34, 41, 43, 44, 45, 46, 47) con validación estructural contra los XSD de la DGII.
- Firma XMLDSig real (RSA-2048 / SHA-256 / canonicalización C14N) usando la librería [`dgii-ecf`](https://github.com/victors1681/dgii-ecf) (`Signature`), DGII-compliant. En desarrollo se firma con un certificado autofirmado generado en memoria; en producción se usa el certificado .p12 real de un PSC (INDOTEL) en cuanto se configure.
- Código de seguridad de 6 dígitos y QR de representación impresa (consulta de timbre), calculados localmente a partir de la firma — no requieren transmisión ni credenciales DGII.
- Retenciones ISR/ITBIS por línea: obligatorias para e-CF 41 (compras) y opcionales para 31/33/34.
- Asignación de eNCF (formato `E` + tipo 2 dígitos + secuencia 10 dígitos, ej. `E310000000001`), asignado una sola vez por comprobante.
- Reportes: resumen agregado (totales, por estado, por tipo) y exportación a CSV.
- Integración DGII vía la librería `dgii-ecf`: autenticación (semilla+firma), transmisión y consulta de estado ya usan las llamadas reales de la DGII cuando hay un certificado P12 configurado (`DGII_CERT_P12_BASE64` + `DGII_CERT_PASSPHRASE`); sin ese certificado (por defecto en dev), responde en **modo MOCK** con el mismo contrato. Solo faltan las credenciales del ambiente TesteCF — no hay cambios de código pendientes para ese flujo. La anulación de rangos (ANECF) sigue sin implementar en modo real (falta el XSD de ese documento).
- Frontend Next.js 14 (App Router) con login, dashboard, creación/detalle de e-CF (incluye QR y código de seguridad), reportes y panel DGII.

## Stack

| Capa | Tecnología |
|------|------------|
| Backend | NestJS 10 + TypeScript |
| Base de datos | PostgreSQL 15 (Docker) + TypeORM 0.3 |
| Autenticación | JWT (Passport) |
| Firma digital | `dgii-ecf` (XMLDSig DGII-compliant, RSA-2048/SHA-256/C14N) + node-forge (certificados) |
| Integración DGII | `dgii-ecf` (semilla/firma/token, transmisión, estado, QR/código de seguridad) |
| Documentación API | Swagger (`/api/docs`) |
| Frontend | Next.js 14 (App Router) + Tailwind CSS |
| Tests | Jest (unitarios) + Jest/Supertest (e2e) |

## Requisitos

- Node.js 20+
- Docker Desktop (PostgreSQL, pgAdmin, Redis)

## Setup

### 1. Clonar e instalar dependencias

```bash
git clone https://github.com/stpdevsolutions-commits/eCF-SaaS.git
cd eCF-SaaS
npm install --legacy-peer-deps

# Frontend
cd frontend && npm install && cd ..
```

### 2. Levantar servicios Docker

```bash
docker-compose up -d
```

Servicios expuestos:

| Servicio | Puerto |
|----------|--------|
| PostgreSQL (`ecf_saas_postgres`) | **5433** (host) → 5432 |
| pgAdmin (admin@example.com / admin) | 5050 |
| Redis | 6379 |

### 3. Configurar `.env`

Crear un archivo `.env` en la raíz:

```env
NODE_ENV=development
APP_PORT=3000
DATABASE_HOST=localhost
DATABASE_PORT=5433
DATABASE_USER=postgres
DATABASE_PASSWORD=postgres
DATABASE_NAME=ecf_saas
JWT_SECRET=dev-secret-key

# Integración DGII real (opcional): sin esto, firma/DGII quedan en modo mock/dev.
# Ver .env.example para el detalle.
DGII_ENVIRONMENT=TesteCF
DGII_CERT_P12_BASE64=
DGII_CERT_PASSPHRASE=
```

> En desarrollo TypeORM usa `synchronize: true` (crea/actualiza el esquema automáticamente). Las migraciones formales viven en `src/database/migrations` (ver `src/database/migrations/README.md`).

### 4. Poblar datos de prueba (seed)

```bash
npm run seed
```

Crea un usuario de prueba (`juan@example.com` / `password123`) con comprobantes de ejemplo. **Advertencia:** el seed borra los datos existentes.

## Cómo correr

### Backend

```bash
npm run dev          # desarrollo con hot-reload → http://localhost:3000
npm run build        # compilar
npm run start:prod   # producción (dist/)
```

- API: http://localhost:3000/api/health
- Swagger: http://localhost:3000/api/docs

### Frontend

```bash
cd frontend
npm run dev -- -p 3005   # → http://localhost:3005
```

Páginas: `/login`, `/dashboard`, `/ecf/nueva`, `/ecf/[id]`, `/reportes`, `/dgii`.

### Tests

```bash
npm run test        # unitarios (backend)
npm run test:cov    # unitarios con cobertura
npm run test:e2e    # e2e (requiere PostgreSQL corriendo; ver test/jest-e2e.json)
```

> Los tests e2e requieren las dependencias de dev `supertest` y `@types/supertest`, además de la base de datos levantada con `docker-compose up -d`.

## Endpoints principales

Todas las rutas llevan el prefijo `/api`. Las rutas de e-CF y DGII requieren JWT (`Authorization: Bearer <token>`).

### Autenticación

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/auth/register` | Registrar usuario |
| POST | `/api/auth/login` | Login (devuelve JWT) |
| GET | `/api/auth/me` | Perfil del usuario autenticado |

### Comprobantes fiscales (e-CF)

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/ecf` | Crear comprobante (estado `draft`) |
| GET | `/api/ecf` | Listar (filtros: `estado`, `rncComprador`) |
| GET | `/api/ecf/:id` | Obtener por ID |
| PUT | `/api/ecf/:id` | Actualizar (solo en `draft`) |
| DELETE | `/api/ecf/:id` | Eliminar |
| POST | `/api/ecf/:id/validate` | Validar estructura XML → `validated` |
| POST | `/api/ecf/:id/sign` | Firmar XMLDSig → `signed` |
| POST | `/api/ecf/:id/transmit` | Transmitir a la DGII → `transmitted` |
| GET | `/api/ecf/:id/status` | Consultar estado en DGII → `accepted` / `rejected` |
| POST | `/api/ecf/:id/cancel` | Cancelar en DGII → `cancelled` |

### Reportes

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/ecf/reportes/resumen` | Resumen agregado (filtros: `desde`, `hasta`, `estado`) |
| GET | `/api/ecf/reportes/export` | Exportar comprobantes a CSV |

### Integración DGII

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/dgii/authenticate` | Autenticar con DGII y guardar el token |
| GET | `/api/dgii/status/:uuid` | Consultar estado por UUID DGII |
| POST | `/api/dgii/cancel/:uuid` | Cancelar comprobante por UUID DGII |

### Ejemplo: crear un e-CF 41 con retenciones

```bash
POST /api/ecf
{
  "tipoEcf": "e-CF_41_v_1_0",
  "rncEmisor": "12345678901",
  "nombreEmisor": "Mi Empresa",
  "rncComprador": "98765432109",
  "nombreComprador": "Proveedor Informal",
  "lineas": [
    {
      "descripcion": "Servicio profesional",
      "cantidad": 1,
      "precioUnitario": 10000,
      "indicadorAgenteRetencionoPercepcion": 1,
      "montoIsrRetenido": 1000,
      "montoItbisRetenido": 1800
    }
  ]
}
```

## Estructura del proyecto

```
src/
├── auth/                  # Registro, login, JWT, entidad User
├── ecf/
│   ├── controllers/       # EcfController (CRUD + ciclo de vida + reportes)
│   ├── services/
│   │   ├── ecf.service.ts         # Lógica de negocio y ciclo de vida
│   │   ├── ecf-xml.service.ts     # Generación de XML por tipo de e-CF
│   │   └── ecf-signing.service.ts # Firma XMLDSig (RSA-2048/SHA-256/C14N)
│   ├── entities/          # Ecf, LineaEcf
│   └── dto/
├── validation/            # Validación estructural + esquemas XSD (e-CF 31–47)
├── dgii/                  # Integración DGII (dgii-ecf real si hay P12; mock si no)
│   ├── dgii.service.ts             # Autenticación/transmisión/estado/anulación
│   └── dgii-certificate.service.ts # Resuelve el certificado (P12 real o autofirmado dev)
├── database/seeders/      # Seed de datos de prueba
├── common/guards/         # JwtAuthGuard
└── main.ts                # Prefijo /api, ValidationPipe, Swagger

frontend/                  # Next.js 14 App Router
├── app/                   # login, dashboard, ecf/nueva, ecf/[id], reportes, dgii
├── components/
└── lib/

test/                      # Tests e2e (jest-e2e.json + app.e2e-spec.ts)
```

## Roadmap / Pendientes

### Completado
- [x] Autenticación JWT + Swagger
- [x] PostgreSQL + TypeORM, CRUD de e-CF
- [x] Generación de XML para los 10 tipos de e-CF y validación estructural (XSD)
- [x] Firma digital XMLDSig real vía `dgii-ecf` (certificado autofirmado en dev; P12 real cuando se configure)
- [x] Ciclo de vida completo con la DGII (transmitir, consultar estado, cancelar) en modo mock
- [x] Retenciones ISR/ITBIS (e-CF 31/33/34/41)
- [x] Reportes (resumen y export CSV)
- [x] Frontend Next.js 14 (login, dashboard, e-CF, reportes, DGII)
- [x] Tests unitarios backend
- [x] Wiring real de autenticación/transmisión/consulta de estado con `dgii-ecf` (falta solo activar con credenciales)
- [x] Código de seguridad (6 dígitos) y QR de representación impresa (offline, no requieren credenciales)

### Pendiente
- [ ] Credenciales del ambiente TesteCF + certificado .p12 de un PSC (INDOTEL) — único bloqueo para producción real
- [ ] Anulación real de e-CF (ANECF): falta el XSD del documento de anulación de rangos y su generador de XML
- [ ] Certificado digital de producción emitido por un PSC acreditado por INDOTEL
- [ ] Migraciones formales de TypeORM (hoy `synchronize` solo en desarrollo)
- [ ] Tests de frontend
- [ ] Endurecimiento para producción: HTTPS, rate limiting, CORS restrictivo, logging/auditoría

## Troubleshooting

```bash
# PostgreSQL no conecta
docker logs ecf_saas_postgres
docker-compose down -v && docker-compose up -d

# Resetear la base de datos (borra datos)
docker-compose down -v
docker-compose up -d
npm run seed
```

## Soporte

- GitHub Issues: https://github.com/stpdevsolutions-commits/eCF-SaaS/issues
- Email: stpdevsolutions@gmail.com

## Licencia

Propietario — STP Dev Solutions
