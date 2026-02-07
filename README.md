# Verificador de Radios

Este es un sistema para verificar si ciertas frases o publicidades aparecen en audios de radio, utilizando Google Gemini AI.

## Configuración Inicial

1.  **Variables de Entorno**:
    Renombra o edita el archivo `.env.local` y agrega tus claves:
    ```env
    NEXT_PUBLIC_SUPABASE_URL=tu_supabase_url
    NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_supabase_anon_key
    GOOGLE_GEMINI_API_KEY=tu_gemini_api_key
    ```

2.  **Base de Datos (Supabase)**:
    Copia el contenido del archivo `supabase_schema.sql` y ejecútalo en el "SQL Editor" de tu proyecto en Supabase.
    Esto creará las tablas `radios`, `verifications` y configurará el Storage bucket `audios` con las políticas de seguridad necesarias.

3.  **Instalar Dependencias**:
    ```bash
    npm install
    ```

4.  **Ejecutar Proyecto**:
    ```bash
    npm run dev
    ```

## Funcionalidades

-   **Login**: Autenticación con Email/Password vía Supabase.
-   **Dashboard**: Gestión de Radios (Crear, Listar).
-   **Verificador**:
    -   Subida de audio (MP3/WAV).
    -   Definición de frase objetivo.
    -   Transcripción y análisis con IA (Gemini).
    -   Historial de verificaciones por radio.
