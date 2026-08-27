# Instrucciones de despliegue — DT CSM App

## Paso 1: Configurar Supabase (base de datos)

1. Ve a **https://supabase.com** → crea una cuenta gratuita
2. Crea un **Nuevo Proyecto** (elige una contraseña para la BD, guárdala)
3. Espera a que termine de provisionar (~2 min)
4. Ve a **SQL Editor** → **New Query**
5. Copia todo el contenido del archivo `supabase/schema.sql` y ejecútalo → clic en **Run**
6. Ve a **Project Settings → API** y copia:
   - `Project URL` → será tu `NEXT_PUBLIC_SUPABASE_URL`
   - `service_role` key (en "Project API keys") → será tu `SUPABASE_SERVICE_ROLE_KEY`
   ⚠️ Nunca compartas la service_role key públicamente

## Paso 2: Preparar el proyecto

1. Crea el archivo `.env.local` en la raíz del proyecto (copia `.env.local.example`):

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
ADMIN_PASSWORD=pon_aqui_tu_contrasena_de_acceso
SESSION_SECRET=cadena_aleatoria_larga_minimo_32_caracteres
ANTHROPIC_API_KEY=sk-ant-api03-...
```

2. Prueba en local:
```bash
npm run dev
```
Abre http://localhost:3000 → verás el login

## Paso 3: Desplegar en Vercel

### Opción A: Subir a GitHub primero (recomendado)
1. Crea un repositorio en GitHub (privado)
2. Sube el proyecto:
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/TU_USUARIO/dt-csm-app.git
git push -u origin main
```
3. Ve a **https://vercel.com** → New Project → Import desde GitHub
4. Selecciona el repositorio → clic en Deploy

### Opción B: Vercel CLI
```bash
npm install -g vercel
vercel
```
Sigue las instrucciones del CLI.

### Variables de entorno en Vercel
En el dashboard de Vercel → tu proyecto → **Settings → Environment Variables**, agrega:
- `NEXT_PUBLIC_SUPABASE_URL` = tu URL de Supabase
- `SUPABASE_SERVICE_ROLE_KEY` = tu service role key
- `ADMIN_PASSWORD` = tu contraseña de acceso a la app
- `SESSION_SECRET` = cadena aleatoria larga (puedes generar con: `openssl rand -base64 32`)
- `ANTHROPIC_API_KEY` = tu API key de Anthropic

Luego redespliega: **Deployments → Redeploy**

## Uso de la app

1. **Login**: entra con la contraseña que definiste en `ADMIN_PASSWORD`
2. **Primer paso**: crea un Año Escolar (ej: "2026") desde el dashboard
3. **Crear cursos**: haz clic en "+ Nuevo curso" dentro del año
4. **Importar estudiantes**: haz clic en "↑ Importar Excel" en cada curso
   - El Excel debe tener una columna con los nombres (puede llamarse "nombre", "name", "estudiante", o ser la primera columna)
5. **Crear periodos**: dentro del curso, haz clic en "+ Periodo"
   - Se crean automáticamente las 4 fases de DT y 1 formativa + 1 sumativa por fase
6. **Calificar**: 
   - **Formativas/Bonus**: clic directo en la celda, escribe la nota (0-10)
   - **Sumativas**: clic en el encabezado de la columna → Modo de calificación rápida
7. **Informes IA**: botón "Informe" al final de cada fila de estudiante

## Notas importantes

- El servidor local necesita las variables en `.env.local` para conectarse a Supabase
- Si cambias la contraseña (`ADMIN_PASSWORD`), debes actualizar la variable en Vercel y redesplegar
- Los datos están en Supabase y persisten entre sesiones y dispositivos
- El plan gratuito de Supabase incluye 500MB de BD y 2GB de transferencia/mes (más que suficiente)
- El plan gratuito de Vercel incluye despliegues ilimitados para proyectos personales
