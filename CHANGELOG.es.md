# Registro de cambios

Lo que cambia en cada versión, y el texto que se publica en la ficha de la Chrome Web
Store. El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y
las versiones, [SemVer](https://semver.org/lang/es/).

Versión en inglés: [CHANGELOG.md](CHANGELOG.md). Los dos ficheros van a la par: lo que
se añade en uno se añade en el otro.

Cada versión trae dos cosas distintas y conviene no mezclarlas:

- **El detalle** (`Añadido` / `Cambiado` / `Corregido`), que es para nosotros y para
  quien mire el repositorio.
- **El texto de la tienda**, que es lo que se pega en el campo _Novedades_ de la
  Chrome Web Store al subir la actualización. Es corto a propósito: la tienda lo
  recorta. La redacción en inglés está en el registro en inglés, porque la ficha se
  publica en los dos idiomas.

## Al publicar una versión

1. Subir el número en `manifest.json` (`"version"`). La tienda rechaza una subida cuyo
   número no sea mayor que el publicado.
2. Mover lo que haya en `Sin publicar` a una sección con su número y su fecha, aquí y
   en `CHANGELOG.md`.
3. Añadir la versión al historial que se ve dentro de la extensión:
   `src/ui/pages/about/components/VersionHistorySection.svelte`, con sus claves de
   traducción en `_locales/es/messages.json` y `_locales/en/messages.json`.
4. Si la versión trae funciones nuevas, añadirlas también a
   `src/ui/pages/about/components/FeatureCategoriesSection.svelte`.
5. `npm run build` y subir el contenido de `dist/` como ZIP.
6. Pegar el texto de la tienda en _Novedades_, en español y en inglés.

---

## Sin publicar

### Añadido

- **Seleccionar un color de la pantalla en el editor de temas.** La pipeta que hay
  junto a cada color abre una lupa sobre la página, con rejilla de píxeles y el valor
  hexadecimal bajo el cursor; al hacer clic se toma el color y además se copia al
  portapapeles, y con Esc se cancela. Donde existe se usa el cuentagotas propio de
  Chrome — en Linux no existe, y por eso el botón no hacía nada.
- **Clic derecho y copiado en las webs que los bloquean.** Vuelven el menú
  contextual, la selección de texto, el copiar, el cortar, el pegar y el arrastrar,
  incluidas las imágenes tapadas por una capa transparente. Viene activado y se
  desactiva en los ajustes de navegación. Los manejadores de la propia página
  siguen ejecutándose, así que una web con su propio menú contextual sigue
  funcionando.
- **Reproductor de música.** Se elige una carpeta del equipo y se carga toda su
  música: reproducir, pausar, detener, pista anterior y siguiente, barra de progreso
  con saltos rápidos, búsqueda dentro de la carpeta y lista completa de pistas. El
  audio sigue sonando mientras se trabaja con las pestañas.
- **Varias horas para una misma consulta programada del asistente.** Una consulta
  puede lanzarse varias veces el mismo día o en cada uno de los días de la semana
  elegidos, en vez de una sola vez.
- **"Todo el día" al programar un tema por días de la semana**, sin tener que
  rellenar la hora de inicio y la de fin.

### Corregido

- El contador `visto/total` que va junto al nombre del grupo ya no se salta el clic
  que despierta al proceso en segundo plano; antes esa pestaña no volvía a contar en
  toda la sesión.
- Una pestaña nueva ya se puede meter en un grupo. "Añadir pestaña a grupo → Nuevo
  grupo" del menú del navegador se deshacía solo.
- Renombrar un grupo ya no hace aparecer letras que nadie escribió, ni reordena la
  barra de pestañas a cada tecla.
- Un grupo que se deja sin nombre recupera el suyo automáticamente, incluso cuando en
  el cuadro solo quedan los caracteres invisibles que la extensión usa para marcar el
  tipo de grupo.
- El aviso de nombre repetido desaparece en cuanto se deshace el duplicado.

### Texto de la tienda

```
Novedades
• Toma cualquier color de la pantalla con la pipeta del editor de temas: lupa, valor hexadecimal y copia al portapapeles.
• El clic derecho, la selección de texto y el copiado vuelven a funcionar en las webs que los bloquean.
• Reproductor de música: elige una carpeta y escucha tu música mientras trabajas, con búsqueda, lista de pistas y controles completos.
• El asistente ya admite varias horas para una misma consulta programada.
• Los temas programados por días de la semana admiten "todo el día".
• Correcciones al renombrar grupos, al contador de pestañas vistas y al agrupado de pestañas nuevas.
```

---

## 1.0.0 — 2025-07-20

Primera versión estable. El detalle de lo que trae está en la propia extensión, en
**Acerca de → Historial de versiones**, que es la lista que ve el usuario.
