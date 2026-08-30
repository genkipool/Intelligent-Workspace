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

- **Leer cualquier página en voz alta.** Un lector que dice el texto de la página,
  resalta el párrafo y va siguiendo la palabra que dice, y se desplaza con ellos. Sus
  controles van en una columna estrecha pegada al borde derecho, que se puede replegar
  y volver a sacar, y responde a la barra espaciadora y a las flechas además de a sus
  propias letras, todas listadas y modificables en los ajustes de navegación. Se llega
  a una página por tres sitios, y en los tres es un interruptor: pasando el ratón por
  el botón del asistente de una pestaña, con el comando `ar` y con el prefijo `ar:` del
  omnibar, que lista todas las pestañas y lee la que se elija, trayéndola al frente si
  estaba dormida. Si el botón del asistente está oculto, el lector se va al menú de
  desbordamiento de esa fila junto al resumen.
- **El lector sigue la palabra que dice, en cualquier sistema.** La marca dependía de
  que el navegador fuese informando de cada palabra, cosa que muchas voces —casi todas
  las de Linux— no hacen nunca, así que en esas máquinas no se movía. Ahora la mueve un
  reloj medido contra el texto, corregido por esos avisos allí donde sí llegan y vuelto
  a medir con cada párrafo que termina, así que se ajusta a la velocidad real de la voz
  después del primero.
- **El lector lee lo que la página dice de verdad.** Titulares y entradillas que viven
  en la cabecera del propio artículo, títulos de posts de Reddit, posts de x.com y los
  títulos, descripciones y comentarios de YouTube: ninguno es un párrafo y todos se
  quedaban fuera. Si hay texto seleccionado, solo se lee la selección.
- **Elegir qué pinta el lector sobre la página.** Los ajustes de navegación permiten
  quitar el panel flotante, la marca que sigue la palabra que se dice y el resaltado
  del texto que se lee, y cada uno tiene su tecla mientras el lector está abierto. Las
  marcas usan los colores del tema y lo siguen cuando cambia.
- **Elegir la voz de lectura.** Los ajustes de navegación tienen ya un selector de
  voces agrupadas por idioma, más velocidad, tono y volumen y un botón que lee una
  frase de ejemplo. Manda sobre el lector de páginas, las notas y el asistente IA por
  igual; en automático sigue eligiendo el navegador, como hasta ahora.
- **Capturar todas las pestañas de un grupo de una vez.** Una cámara en la tarjeta
  del grupo lo recorre pestaña a pestaña y captura cada una en la galería del grupo,
  con una cuenta de progreso mientras trabaja. Al pasar el ratón ofrece el mismo
  recorrido pero capturando la página completa de cada pestaña.
- **Capturar la página completa, no solo lo que se ve.** La cámara de una pestaña
  ofrece ya tres formas de capturar —el área visible, la página entera y un área que
  se dibuja— y la página entera se cose recorriéndola, evitando que las cabeceras
  fijas y los avisos de cookies se estampen en cada franja.
- **Descargar una captura en PNG, en PDF o en los dos.** El botón de descarga —el de
  una tarjeta y el de la galería entera— pregunta cuál, y un PDF de varias capturas es
  un solo documento en vez de una carpeta llena de archivos de una página. Una página
  larga se reparte entre tantas hojas A4 como haga falta.
- **Capturar la página completa por partes**, una imagen por pantalla, para una página
  que se ve mejor como una serie de pantallas que como una imagen del alto de un
  edificio.
- **Seleccionar un color de la pantalla en el editor de temas.** La pipeta que hay
  junto a cada color abre una lupa sobre la página, con rejilla de píxeles y el valor
  hexadecimal bajo el cursor; al hacer clic se toma el color y además se copia al
  portapapeles, y con Esc se cancela. La lupa es la misma en todos los sistemas, así
  que la pipeta se comporta igual en cualquiera — el cuentagotas propio de Chrome no
  existe en Linux, y por eso el botón no hacía nada.
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

- Pegar en Telegram ya no pega el texto dos veces. El desbloqueo del clic derecho
  también anulaba el intento de la página de cancelar un pegado, y Telegram cancela
  todos los pegados para insertar él mismo el portapapeles, así que el texto entraba
  una vez por la aplicación y otra por el navegador. Ahora un pegado cancelado se
  respeta, y solo se repone cuando la página lo canceló sin llegar a leer el
  portapapeles: un bloqueo y nada más.
- Pausar el lector y volver a darle continúa por la palabra que está marcada. Antes
  devolvía la lectura al navegador, que en algunos sistemas la reanudaba en otro sitio
  o no la reanudaba nunca.
- Las velocidades por encima de 1 ya no van más rápido de lo pedido. El selector del
  panel y la velocidad de los ajustes de navegación se multiplicaban entre sí; ahora
  son dos vistas del mismo número, y mover cualquiera de los dos se oye al momento.
- El tono más grave vuelve a notarse. El cero —el extremo del control— se leía como
  "no hay valor" y se convertía sin más en el centro del rango.
- Capturar un grupo entero ya no vuelve a la pestaña en la que estabas entre captura y
  captura; vuelve una sola vez, cuando termina la última.
- El altavoz de una pestaña ya no se traga un clic. Decidía qué hacer mirando la
  tarjeta en vez de la pestaña, y las dos podían no coincidir.
- El altavoz de la vista previa de un Short de YouTube funciona en todos. En unos
  activaba el sonido y en otros no: YouTube mantiene esas vistas previas silenciadas y
  les devuelve el silencio, así que que el sonido aguantara era cuestión de suerte.
  Ahora además suena al volumen que tengas puesto en YouTube en vez de a tope, y deja
  de salir en las vistas previas de los vídeos normales, que llevan el altavoz del
  propio YouTube. Cuando la vista previa aún no ha arrancado, o ya ha terminado, ya no
  queda un altavoz invisible sobre la miniatura comiéndose el clic que abre el Short.

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
• Lee cualquier página en voz alta, con el párrafo y la palabra iluminados según se dicen, y la voz, la velocidad y el tono que elijas.
• Captura la página completa —no solo lo que se ve— y descárgala en PDF.
• Captura todas las pestañas de un grupo con un clic.
• Toma cualquier color de la pantalla con la pipeta del editor de temas: lupa, valor hexadecimal y copia al portapapeles.
• El clic derecho, la selección de texto y el copiado vuelven a funcionar en las webs que los bloquean.
• Reproductor de música: elige una carpeta y escucha tu música mientras trabajas, con búsqueda, lista de pistas y controles completos.
• El asistente ya admite varias horas para una misma consulta programada.
• Los temas programados por días de la semana admiten "todo el día".
• Correcciones al renombrar grupos, al contador de pestañas vistas, al agrupado de pestañas nuevas y al altavoz de las vistas previas de los Shorts de YouTube.
```

---

## 1.0.0 — 2025-07-20

Primera versión estable. El detalle de lo que trae está en la propia extensión, en
**Acerca de → Historial de versiones**, que es la lista que ve el usuario.
