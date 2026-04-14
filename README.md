# eCF-SaaS v0.0.1

SaaS de Facturación Electrónica para República Dominicana (Ley 32-23)

## 📋 Estado

✅ **SPRINT 2 COMPLETADO** - API lista para testing con PostgreSQL e integración DGII

## 🚀 Inicio Rápido

### Requisitos
- Node.js 24+
- Docker Desktop
- PostgreSQL (en Docker)

### Instalación

```bash
# 1. Clonar repositorio
git clone https://github.com/stpdevsolutions-commits/eCF-SaaS.git
cd eCF-SaaS

# 2. Instalar dependencias
npm install --legacy-peer-deps

# 3. Iniciar servicios Docker
docker-compose up -d

# 4. Esperar a que PostgreSQL esté listo (30 segundos)
sleep 30

# 5. Ejecutar aplicación
npm run dev
```

## 🎯 Acceder a la API

| Servicio | URL |
|----------|-----|
| **API** | http://localhost:3000/api/health |
| **Swagger Docs** | http://localhost:3000/api/docs |
| **pgAdmin** | http://localhost:5050 (admin@example.com / admin) |
| **Redis** | localhost:6379 |

## 📚 Endpoints Principales

### Autenticación
```bash
# Registrar
POST /api/auth/register
{
  "nombre": "Juan Pérez",
  "email": "juan@test.com",
  "password": "SecurePass123!",
  "numeroRegistro": "12345678901",
  "tipoPersona": "juridica"
}

# Login
POST /api/auth/login
{
  "email": "juan@test.com",
  "password": "SecurePass123!"
}

# Perfil (requiere JWT)
GET /api/auth/me
Header: Authorization: Bearer <TOKEN>
```

### Comprobantes Fiscales
```bash
# Crear
POST /api/ecf
{
  "tipoEcf": "e-CF_31_v_1_0",
  "rncEmisor": "12345678901",
  "nombreEmisor": "Mi Empresa",
  "rncComprador": "98765432109",
  "nombreComprador": "Cliente",
  "lineas": [
    {
      "descripcion": "Producto A",
      "cantidad": 1,
      "precioUnitario": 1000
    }
  ]
}

# Listar
GET /api/ecf?estado=draft&rncComprador=987654

# Obtener
GET /api/ecf/{id}

# Actualizar
PUT /api/ecf/{id}

# Eliminar
DELETE /api/ecf/{id}

# Validar
POST /api/ecf/{id}/validate

# Firmar
POST /api/ecf/{id}/sign
```

### DGII Integration
```bash
# Autenticar con DGII
POST /api/dgii/authenticate
{
  "rncEmisor": "12345678901",
  "usuario": "usuario",
  "clave": "clave"
}

# Consultar estado
GET /api/dgii/status/{uuid}

# Cancelar
POST /api/dgii/cancel/{uuid}
{
  "motivo": "Anulación",
  "token": "token_dgii"
}
```

## 🗂️ Estructura del Proyecto

```
src/
├── auth/
│   ├── entities/user.entity.ts
│   ├── services/auth.service.ts
│   ├── controllers/auth.controller.ts
│   ├── dto/
│   └── auth.module.ts
├── ecf/
│   ├── entities/
│   │   ├── ecf.entity.ts
│   │   └── linea-ecf.entity.ts
│   ├── services/ecf.service.ts
│   ├── controllers/ecf.controller.ts
│   ├── dto/
│   └── ecf.module.ts
├── validation/
│   ├── xsd-validator.service.ts
│   ├── schemas/
│   │   ├── e-CF_31_v_1_0.xsd
│   │   ├── e-CF_32_v_1_0.xsd
│   │   └── ... (E31-E47)
│   └── validation.module.ts
├── dgii/
│   ├── dgii.service.ts
│   ├── dgii.controller.ts
│   └── dgii.module.ts
├── database/
│   └── seeders/index.ts
├── common/
│   ├── guards/jwt-auth.guard.ts
│   └── decorators/
└── app.module.ts
```

## 🧪 Testing

```bash
# Tests unitarios
npm run test

# Tests con cobertura
npm run test:cov

# Tests e2e
npm run test:e2e
```

## 🛠️ Comandos Útiles

```bash
# Desarrollo con hot-reload
npm run dev

# Compilar
npm run build

# Producción
npm run start:prod

# Linting
npm run lint

# Ver logs de Docker
docker logs ecf_saas_postgres

# Resetear BD
docker-compose down -v
docker-compose up -d
```

## 📊 Características

✅ NestJS + TypeScript
✅ PostgreSQL + TypeORM
✅ JWT Authentication
✅ Swagger/OpenAPI Documentation
✅ XSD Validation (DGII Schemas)
✅ DGII Integration (Basic)
✅ CRUD Endpoints
✅ Unit Tests
✅ Docker Compose
✅ Hot-reload Development

## 🔒 Seguridad

⚠️ **Desarrollo:**
- JWT secret en .env
- CORS habilitado
- Validación básica

⚠️ **Producción (TODO):**
- [ ] JWT secret en variables secretas
- [ ] HTTPS obligatorio
- [ ] Rate limiting
- [ ] CORS restrictivo
- [ ] Logging y auditoría
- [ ] Encriptación de contraseñas (bcrypt ✅)

## 📅 Roadmap

### Sprint 1 ✅
- [x] Scaffold NestJS
- [x] Autenticación JWT
- [x] Swagger API Docs

### Sprint 2 ✅
- [x] PostgreSQL Integration
- [x] XSD Validation
- [x] CRUD Endpoints
- [x] DGII Basic Integration
- [x] Unit Tests

### Sprint 3 🚀
- [ ] Firma Digital
- [ ] Transmisión a DGII
- [ ] Reportes
- [ ] Retenciones

### Sprint 4
- [ ] UI Web (React/Next.js)
- [ ] Mobile App
- [ ] Analytics
- [ ] Production Deploy

## 🐛 Troubleshooting

### PostgreSQL no conecta
```bash
docker logs ecf_saas_postgres
docker-compose down -v
docker-compose up -d
sleep 30
npm run dev
```

### Error de migraciones
```bash
npm run migration:run
```

### Resetear todo
```bash
# Detener contenedores
docker-compose down -v

# Limpiar node_modules
rm -rf node_modules package-lock.json

# Instalar nuevamente
npm install --legacy-peer-deps

# Iniciar
docker-compose up -d
npm run dev
```

## 📞 Soporte

Para reportar bugs o solicitar features:
- GitHub Issues: https://github.com/stpdevsolutions-commits/eCF-SaaS/issues
- Email: stpdevsolutions@gmail.com

## 📄 Licencia

Propietario - STP Dev Solutions

---

**Versión:** 0.0.1
**Última actualización:** 14/04/2026
**Estado:** Desarrollo (Sprint 2 Completado)
