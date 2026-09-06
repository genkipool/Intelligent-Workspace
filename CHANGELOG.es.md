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

- Las notas reunidas de todos los contextos — la sección de huérfanas y el botón de
  notas del popup — ya se pueden editar. El botón se quitaba de esas tarjetas porque
  guardar desde una lista que no pertenece a ningún grupo no tenía dónde archivar la
  nota; ahora editar no archiva nada, así que el botón se queda.
- **Leer cualquier página en voz alta.** Un lector que dice el texto de la página,
  resalta el párrafo y va siguiendo la palabra que dice, y se desplaza con ellos. Sus
  controles van en una columna estrecha pegada al borde derecho, que se puede replegar
  y volver a sacar, y responde a la barra espaciadora y a las flechas además de a sus
  propias letras, todas listadas y modificables en los ajustes de navegación. Se llega
  a una página por cuatro sitios, y en los cuatro es un interruptor: pasando el ratón
  por el botón del asistente de una pestaña, desde el menú del clic derecho del
  navegador, con el comando `ar` y con el prefijo `ar:` del omnibar, que lista todas las
  pestañas y lee la que se elija, trayéndola al frente si estaba dormida. Si el botón
  del asistente está oculto, el lector se va al menú de desbordamiento de esa fila junto
  al resumen.
- **El lector está en el menú del clic derecho.** Al pulsar con el botón derecho sobre
  una página se ofrece leerla en voz alta, y sobre un texto seleccionado se ofrece leer
  la selección —que es lo que el lector hace con una selección de todos modos, así que
  las dos entradas son la misma orden con el título que corresponde a lo que se pulsó—.
  Un segundo clic detiene la lectura, y como el menú se cierra al pulsar, un aviso dice
  cuál de las dos cosas acaba de pasar. Ese aviso dice ya «leyendo la selección» se
  arranque el lector desde donde se arranque, en vez de decir que lee la página.
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
- **Actividad web.** Un panel de control del tiempo que cuesta de verdad navegar:
  cuánto se pasa en cada sitio, contado solo mientras se está de verdad —el reloj se
  para al ausentarse o cuando el navegador pierde el foco— y clasificado por
  categorías, las que reconoce solo y las que añade uno. Un tiempo permitido al día y
  otro a la semana por sitio, con aviso antes de que se agote, y unas horas fuera de
  las cuales el sitio no se abre; un sitio pasado de su tiempo enseña una pantalla que
  dice por qué está bloqueado y cuándo se levanta, con cinco minutos más si hacen
  falta, y se le puede poner una contraseña delante a las reglas para que quitar una no
  esté a un clic. Los patrones se dibujan como un año en un mapa de calor, las horas
  del día y los días de la semana, y cada sitio se lista con búsqueda, ordenación y las
  columnas que se elijan. Hay sitios que se pueden dejar fuera del registro, el
  historial antiguo se borra pasado el tiempo que se fije, y todo se guarda en este
  dispositivo, con importación, exportación y sincronización opcional entre navegadores.
  También se abre en el panel lateral, que se puede fijar, con lo que se está
  cronometrando ahora mismo.
- **Radio en línea, junto a la música.** Busca miles de emisoras en directo por
  nombre, país o género, añade varias de una vez y guarda las que te gusten —guardadas
  en el dispositivo, exportadas e importadas como JSON sin duplicados, y sincronizadas
  entre navegadores—. La música local, las emisoras y una única cola unificada son tres
  pestañas del mismo reproductor.
- **Una nota con el texto seleccionado.** Selecciona algo en una página y una tecla
  —o el menú del clic derecho del navegador, que es el mismo comando— lo archiva como
  nota en el grupo al que pertenece la página, titulada con el encabezado más cercano
  por encima de la selección —el último `h1`, `h2` o `h3` anterior a ella— y, en una
  página sin ningún encabezado, con el nombre de la pestaña. Una segunda selección bajo
  el mismo encabezado se añade a la nota que ya hay, así que una página larga deja una
  nota por sección en vez de una sola para todo.
- **Capturar un grupo entero desde el teclado.** Los tres recorridos que ofrece la
  cámara de una tarjeta de grupo —el área visible de cada pestaña, la página completa
  de cada pestaña y la página completa de cada pestaña por partes— tienen cada uno su
  propio comando, listado y cambiable en los ajustes de navegación como los demás.
- **La licencia está en la página «Acerca de»**, en el idioma de quien lee: el
  copyright, lo que la licencia permite —leer el código, compilarlo para uno mismo,
  bifurcarlo para mandar un Pull Request de vuelta— y lo que no, con un enlace al texto
  completo bilingüe del repositorio.
- **El altavoz de la vista previa de un Short de YouTube** aparece ya entre las
  funcionalidades a las que pertenece; enciende el sonido al volumen que ya se usa en
  YouTube y sigue encendido de un Short al siguiente.
- **Abrir lo que sea en el panel lateral desde la omnibar.** Un prefijo propio lista
  las pestañas abiertas y acepta también una dirección o una búsqueda, y Ctrl+Enter
  hace lo mismo con el resultado que esté seleccionado: una pestaña, un marcador, una
  entrada del historial, una página cerrada hace poco o la propia búsqueda.

### Cambiado

- La barra de búsqueda de la lista de grupos abre en el panel lateral con Enter, y en
  una pestaña del navegador con Ctrl+Enter. Era al revés: el panel es donde vive la
  caja y donde casi siempre se quiere leer lo que se escribe en ella, así que es la
  respuesta que no necesita modificador, y salir del panel es la pulsación deliberada.
  El modificador significa además lo mismo en todas partes: antes se ignoraba con una
  página abierta en el panel o desde la ventana emergente, que forzaban el panel se
  pulsara lo que se pulsara.

### Corregido

- Un grupo automático coge el color del sitio que contiene muchas más veces, y deja de
  equivocarse para el resto de la sesión. El color sale del favicon del sitio, y el
  icono se estaba pidiendo por la peor de las tres vías que da Chrome: la dirección que
  declara la propia página, que cuesta una petición nombrando la página que se está
  leyendo y que además no se puede descodificar cuando el sitio sirve un SVG — así que
  GitHub, Stack Overflow, MDN y Hacker News, precisamente los sitios con el color más
  reconocible, nunca tenían ninguno. Ahora se lee del icono que Chrome ya tiene, que no
  sale del navegador y contesta en uno o dos milisegundos. La otra mitad del problema
  era el momento: el favicon llega un instante después de que la página se dé por
  cargada, que es después de haber construido el grupo, y para un sitio que aún no
  conoce Chrome no contesta con nada sino con un globo gris de relleno. Ese relleno se
  estaba archivando como «este sitio no tiene color», así que un grupo construido en
  ese hueco se quedaba con un color provisional para siempre. Ahora el relleno se
  reconoce como lo que es, y a un grupo que se quedó con un color provisional se le
  pone el suyo en cuanto aparece el icono — salvo que se haya cambiado a mano mientras
  tanto, en cuyo caso no se vuelve a tocar nunca.
- Salir de la galería ya no deja la lista de grupos con la fila de búsqueda
  equivocada. La clase de la que la hoja de estilos cuelga la barra de búsqueda plegada
  y los controles repartidos se quita al pintar una vista encima de la lista, y nadie la
  volvía a poner, así que una galería cerrada al borrar su última captura volvía a una
  lista que no coincidía con la que abre el propio botón del popup. Las notas, la vista
  web y el asistente volvían igual, y con ellos se quedaban ocultos los paneles del
  pomodoro y del reproductor.
- La versión más reciente del historial de la página «Acerca de» se puede plegar. Se
  forzaba abierta en cada repintado, así que era la única entrada de la lista que no
  respondía a un clic; y abrir una versión de la segunda página ya no abre la que
  ocupara esa misma posición en la primera.
- Editar una nota ya no la cambia de sitio. Al guardar se reconstruía el contexto a
  partir de la lista que hubiera en pantalla, así que editar desde la sección de
  huérfanas o desde el botón de notas del popup reescribía el contexto de la tarjeta:
  una nota archivada en `Genkipool` volvía como `General`. Una nota solo cambia de sitio
  cuando la mueve el usuario; la sesión de pomodoro que hay detrás del filtro Pomodoro
  también sobrevive a la edición.
- Los botones de copiar y borrar de una nota dicen lo que hacen. Sus descripciones
  apuntaban a una traducción que nunca se escribió, así que se veía la clave.
- Borrar la última nota ya no cierra la vista de notas. Antes devolvía al listado de
  grupos, que desde el botón de notas del popup es una pantalla que nadie había pedido;
  ahora la lista vacía se queda donde está, con su mensaje de bienvenida.
- El texto enriquecido que se pega en una nota se queda dentro de la nota. Lo que trae
  el portapapeles viene medido para la página de la que se copió — anchos de tabla,
  tamaños en píxeles, `float`, trozos posicionados — y pegado en crudo se dibujaba por
  encima de la tarjeta. Se conserva el formato y se tira la maquetación, al pegar y otra
  vez al pintar una nota antigua, así que una nota guardada antes de esto también queda
  contenida. Una tabla pegada se desplaza dentro de sí misma en vez de abrir la tarjeta,
  y las etiquetas `script`, los manejadores de eventos y los enlaces `javascript:` no
  sobreviven al pegado.
- La consola ya no avisa de que una petición a la IA local no declaró idioma de salida.
  Las sesiones ya lo declaraban; `availability()` — que el panel pregunta en cada
  arranque — no, y es una petición como cualquier otra.
- El botón de leer en voz alta de una pestaña enseña una voz: cinco barras que suben y
  bajan, la forma que dibuja una onda mientras alguien habla. Antes era un altavoz con
  una sola onda tan plana que se leía como un guion pegado al cono y no como sonido, y
  además se salía por el borde derecho de su caja y quedaba cortada en plano.
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
• Actividad web: mira lo que te cuesta en tiempo cada sitio, ponle un límite al día o a la semana y las horas a las que se puede abrir, y que se bloquee cuando se agote.
• Lee cualquier página en voz alta, con el párrafo y la palabra iluminados según se dicen, y la voz, la velocidad y el tono que elijas.
• Captura la página completa —no solo lo que se ve— y descárgala en PDF.
• Captura todas las pestañas de un grupo con un clic.
• Toma cualquier color de la pantalla con la pipeta del editor de temas: lupa, valor hexadecimal y copia al portapapeles.
• El clic derecho, la selección de texto y el copiado vuelven a funcionar en las webs que los bloquean.
• Reproductor de música y radio en línea: tu propia carpeta o miles de emisoras en directo, con búsqueda, lista de pistas y controles completos.
• Toma una nota con el texto que selecciones, en el grupo al que pertenece la página.
• Abre una pestaña, una dirección o una búsqueda en el panel lateral desde la omnibar.
• El asistente ya admite varias horas para una misma consulta programada.
• Los temas programados por días de la semana admiten "todo el día".
• Correcciones al renombrar grupos, al contador de pestañas vistas, al agrupado de pestañas nuevas y al altavoz de las vistas previas de los Shorts de YouTube.
```

---

## 1.0.0 — 2025-07-20

Primera versión estable. El detalle de lo que trae está en la propia extensión, en
**Acerca de → Historial de versiones**, que es la lista que ve el usuario.
