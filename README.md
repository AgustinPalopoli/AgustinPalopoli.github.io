# Landing — Agustín Palopoli

Esta es mi landing page personal: la armé para tener algo para mostrar en mi
tarjeta de presentación y que quien la escanee vea de una un poco de lo que
hago. Es una página estática (HTML5 + CSS3 + JS ES6 + p5.js), sin frameworks,
lista para publicar en GitHub Pages.

## Estructura

```
index.html
css/style.css
js/main.js                 → header, menú móvil, scroll reveal, cursor custom
js/hero-animation.js       → animación ASCII (marching squares → "AP") en el hero
js/interactive-scene.js    → escena 3D WEBGL con orbitControl en la sección intermedia
assets/favicon.svg
assets/agustin-palopoli.jpg → mi foto, la uso en "Sobre mí"
```

## Qué tiene la página

- **Header con nav fijo.** En desktop se ve como un nav horizontal normal;
  el link "Contacto" está resaltado como una pastilla verde para que
  funcione como el llamado a la acción del menú (antes tenía un botón
  aparte de "Solicitar presupuesto", pero lo saqué para simplificar). En
  mobile se abre como un panel a pantalla completa con los links en
  columna; lo armé con `100dvh` y `overflow-y: auto` para que nunca quede
  cortado, ni siquiera en navegadores donde la barra de direcciones
  aparece y desaparece.
- **Hero** con la animación ASCII de fondo (ver más abajo) y los botones
  principales de contacto.
- **Servicios**, con tres tarjetas (sitios, tiendas online, sistemas a medida).
- **Statement**, una frase corta a modo de declaración de principios: la
  ocupo en un bloque más ancho que antes (no tan centrado en una columna
  angosta), con la primera oración más grande y la segunda en cursiva y
  más chica, a modo de aclaración.
- **Escena 3D interactiva**, con una tarjeta de instrucciones en la
  esquina que ahora es una lista con ícono para cada acción ("clic y
  arrastrá para girarla" / "doble clic para expandirla") en vez de una
  sola línea de texto corrida.
- **Beneficios**, en formato grilla.
- **Sobre mí**, con mi foto real dentro de un círculo con borde y glow
  verde neón.
- **CTA final** y **footer** con mis redes y contacto.
- Todo el texto de la página (párrafos) usa márgenes justificados
  (`text-align: justify` + `hyphens: auto`), así los renglones quedan
  parejos de los dos lados en vez de irregulares.

## Notas técnicas

- Las dos animaciones usan p5.js en **modo instancia**, cada una montada en su propio contenedor (`#hero-canvas-container` y `#scene-canvas-container`), así no interfieren entre sí.
- Ambas respetan `prefers-reduced-motion`: si tengo esa preferencia activada, se muestra un fondo estático suave en vez de la animación.
- El cursor personalizado (una nave estilo Asteroids en SVG —nariz, dos esquinas traseras y muesca central—, inclinada como un puntero de mouse, solo contorno con glow neón, nariz como hotspot exacto) se desactiva automáticamente en dispositivos táctiles (`hover: none`).
- Los textos, colores y tipografías están centralizados como variables CSS (`:root`) en `css/style.css` para editar rápido la identidad visual.
- La foto de "Sobre mí" se recorta a círculo con `object-fit: cover` sobre un `<img>`, no hace falta que el archivo de origen sea perfectamente cuadrado.

## Cómo funciona la animación del hero (`js/hero-animation.js`)

La animación del hero muestra un campo de caracteres ASCII (`. : + * # █`) que se comporta como un mapa de contornos ("marching squares") y que cíclicamente se reorganiza hasta formar mis iniciales **AP**, para después volver a dispersarse. El archivo está comentado línea por línea, pero acá va el resumen:

1. **Grilla invisible.** Divido el canvas en columnas y filas; cada celda de esa grilla tiene, en todo momento, un carácter dibujado encima.

2. **Máscara de la letra.** En vez de definir a mano qué celdas forman la "A" y la "P", renderizo el texto "AP" una sola vez en un lienzo oculto (`createGraphics`) del mismo tamaño que la grilla (1 pixel = 1 celda). Después recorro ese lienzo pixel por pixel: si quedó blanco, esa celda "pertenece" a la letra.

3. **Campo de ruido.** Cada celda calcula un valor de `noise()` (ruido Perlin) combinado con una onda seno/coseno. Ese valor cumple el mismo rol que el campo escalar de un algoritmo de marching squares: define tanto **hacia dónde se desplaza** el carácter en la fase dispersa como **qué carácter** dibujo (los valores altos usan caracteres más "densos" como `█`, los bajos usan `.`).

4. **Timeline cíclico.** Un reloj interno divide el ciclo (~4.6s) en fases: disperso → transición hacia la letra → letra formada → transición de vuelta → caos → repetir. Un valor `morph` (0 a 1) indica en qué punto de esa transición está la animación en cada instante, suavizado con una curva ease-in-out para que el movimiento no sea mecánico.

5. **Interpolación.** En cada frame, la posición final de cada carácter es un `lerp` entre su posición dispersa (la que le da el ruido) y su posición dentro de la letra, usando `morph` como factor. Las celdas que no son parte de "AP" se alejan un poco más mientras la letra se arma, para que el contraste se lea con claridad. Un pequeño temblor constante (independiente del morph) hace que hasta la letra ya formada se sienta viva.

No uso imágenes ni texto HTML: todo el "AP" que se ve es, en realidad, cientos de caracteres ASCII individuales que posiciono con matemática en cada frame.
