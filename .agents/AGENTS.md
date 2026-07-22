# AGENTS.md - Reglas y Convenciones del Proyecto Workflow de Tareas

## Control de Versionamiento (Semantic Versioning)

### Regla Obligatoria de Versionamiento:
1. **Esquema `MAJOR.MINOR.PATCH`**:
   - **MAJOR (ej. 3.0.0)**: Cambios estructurales grandes en la arquitectura, rediseño completo de la base de datos o breaking changes.
   - **MINOR (ej. 3.1.0)**: Nuevas funcionalidades significativas (ej. nuevo módulo, nuevo sistema de notificaciones, cambio de escala de evaluación).
   - **PATCH (ej. 2.0.1)**: Corrección de errores (bug fixes), retoques visuales, pequeñas mejoras o parches.
2. **Actualización Visual**:
   - Cada cambio de versión DEBE verse reflejado en el badge del sidebar superior en `static/index.html` (elemento `<span ...>V2.0.1</span>`).
3. **Registro de Historial de Versiones**:
   - Mantener el log de versiones en este archivo para que la IA sepa exactamente el estado de cada versión y determine si los cambios a desplegar requieren o no tocar la Base de Datos (`workflow_tareas.db`).

---

## Historial de Versiones

### [v2.0.1] - 2026-07-22 (Versión Actual para Producción IIS)
- **Cambios Realizados**:
  - Cambio completo de escala de encuestas de "Notas" (1-5) a **"% de Satisfacción"** (0-4 con 100% equivalente).
  - Actualización del Dashboard, Historiales, Modal de Respuestas Detalladas y exportación a formato % de Satisfacción.
  - Corrección de la lógica de **"Restaurar Tareas"**: Des-elimina tareas de la papelera sincronizando el % de peso actual de la plantilla.
  - Notificaciones automáticas por correo al responder encuestas con plantilla personalizable, correos múltiples y reporte PDF adjunto (`reportlab`).
  - Preparación de componentes de producción: `run_waitress.py`, `web.config`, `requirements.txt`.
- **Requiere modificación de estructura de Base de Datos**: No (Totalmente compatible con la estructura v2.0.0).
