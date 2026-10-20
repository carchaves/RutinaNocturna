# Rutina nocturna

App para llevar el seguimiento de tres hábitos nocturnos (proyecto, meditación, lectura), con vista semanal, racha de noches completas y datos guardados en el dispositivo.

## Desarrollo

```bash
npm install
npm run dev
```

Abre `http://localhost:5173`.

## Build de producción

```bash
npm run build
npm run preview
```

## Instalar en el celular

La app es una PWA instalable: al abrirla en el navegador del teléfono, usa la opción "Agregar a pantalla de inicio" (Android) o "Añadir a inicio" (iOS/Safari) para tenerla como ícono independiente.

## Datos

El progreso se guarda en `localStorage` del navegador, por lo que es local a cada dispositivo/navegador. "Borrar datos" en la app elimina todo el historial sin posibilidad de deshacer.
