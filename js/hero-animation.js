/* ============================================================================
   hero-animation.js
   ----------------------------------------------------------------------------
   Esta es la animación del hero: armé un campo de caracteres ASCII que se
   comporta como un mapa de contornos (al estilo "marching squares") y que,
   cíclicamente, se reorganiza hasta formar mis iniciales "AP" para después
   volver a dispersarse.

   CÓMO LA PENSÉ
   ----------------------------------------------------------------------------
   1. Armo una grilla invisible sobre el canvas (cols x rows).
   2. A cada celda de esa grilla le corresponde UN carácter ASCII.
   3. Cada carácter tiene dos "destinos" posibles:
        a) su posición dispersa: la calculo en tiempo real con ruido Perlin
           (noise), que es justo el tipo de campo escalar continuo que se usa
           como entrada en un algoritmo de marching squares. Acá no dibujo
           las líneas de contorno con geometría; en cambio, dejo que ese
           mismo campo empuje a cada carácter en una dirección y con una
           fuerza distinta, para generar el movimiento orgánico de "ondas".
        b) su posición dentro de la letra: la obtengo una única vez, al
           inicio, renderizando el texto "AP" en un lienzo auxiliar oculto
           (offscreen) y revisando qué celdas de la grilla caen dentro de
           esas letras (esto es la "máscara" de la letra).
   4. Un reloj interno (el "timeline") define en qué momento del ciclo estoy,
      y con eso calculo un valor "morph" entre 0 (disperso) y 1 ("AP"
      totalmente formado). Ese valor lo uso para interpolar (lerp) entre la
      posición dispersa y la posición de la letra.
   5. El carácter que dibujo en cada celda (un punto, un asterisco, un
      bloque, etc.) también depende del valor del campo de ruido en ese
      instante, así que la "textura" ASCII cambia todo el tiempo, dando la
      sensación de una superficie viva.
   ============================================================================ */
(() => {
  'use strict';

  // Contenedor donde p5 va a montar su <canvas> (modo instancia, ver abajo).
  const container = document.getElementById('hero-canvas-container');
  if (!container || typeof p5 === 'undefined') return;

  // Si el usuario prefiere menos movimiento, no corro la animación: muestro
  // un fondo estático y suave en su lugar (ver el final del archivo).
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Uso p5 en "modo instancia" (function(p) {...}) en vez del modo global
  // (setup()/draw() sueltos) porque en esta página tengo una SEGUNDA
  // animación de p5 (la escena 3D). Si las dos usaran el modo global,
  // chocarían entre sí.
  const sketch = (p) => {

    // Set de caracteres ASCII, ordenado de "más vacío" a "más denso". El
    // carácter que elijo en cada celda depende de qué tan "alto" o "bajo"
    // está el campo de ruido en ese punto, igual que en un mapa de
    // contornos uso distintos tonos según la altura del terreno.
    const CHARSET = ['.', ':', '+', '*', '#', '█'];

    let cols, rows, cellSize;   // dimensiones de la grilla
    let cells = [];             // una entrada por cada carácter en pantalla
    let w, h;                   // tamaño del canvas
    let letterField;            // lienzo oculto que uso para "leer" la forma de "AP"

    // --------------------------------------------------------------------
    // TIMELINE DEL CICLO (en milisegundos)
    // El ciclo completo se repite para siempre. Lo armé corto (~4.6s) para
    // que se sienta ágil y no haga esperar al visitante para ver el efecto.
    // --------------------------------------------------------------------
    const T_DISPERSED   = 1100; // fase caótica inicial, sin formar nada
    const T_TO_LETTERS  = 1000; // transición: el campo empuja los caracteres hacia "AP"
    const T_HOLD        = 900;  // "AP" se mantiene legible, con ondas pasando por encima
    const T_BREAK       = 900;  // la letra se rompe y vuelve a dispersarse
    const T_CHAOS_TAIL  = 700;  // un respiro caótico antes de reiniciar el ciclo
    const CYCLE = T_DISPERSED + T_TO_LETTERS + T_HOLD + T_BREAK + T_CHAOS_TAIL;

    let startTime = 0;

    // Curva de aceleración/desaceleración suave (ease-in-out cúbica). La uso
    // para que la transición entre "disperso" y "letra" no sea lineal:
    // arranca despacio, acelera en el medio y frena al llegar, que es lo
    // que hace que el movimiento se sienta orgánico y no mecánico.
    function easeInOutCubic(t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    // ----------------------------------------------------------------------
    // Construye (o reconstruye, ante un resize) toda la grilla de caracteres
    // y la máscara de la letra "AP".
    // ----------------------------------------------------------------------
    function buildGrid() {
      w = container.clientWidth;
      h = container.clientHeight;

      // La cantidad de columnas se adapta al ancho disponible: en mobile
      // uso menos celdas (mejor rendimiento, caracteres más grandes); en
      // desktop uso más para lograr el efecto de "miles" de caracteres.
      const targetCols = w < 480 ? 30 : w < 900 ? 42 : 54;
      cols = targetCols;
      cellSize = w / cols;
      rows = Math.floor(h / cellSize);

      // --- Máscara de la letra --------------------------------------------
      // El truco que usé: en vez de definir a mano qué celdas forman la "A"
      // y la "P", le pido al propio motor de texto que las dibuje una vez
      // en un buffer invisible del mismo tamaño que la grilla (cols x rows,
      // 1 pixel = 1 celda). Después recorro ese lienzo pixel por pixel: si
      // quedó blanco, esa celda "pertenece" a la letra; si quedó negro, es
      // fondo.
      letterField = p.createGraphics(cols, rows);
      letterField.pixelDensity(1); // 1 pixel real = 1 celda, sin escalar
      letterField.background(0);
      letterField.fill(255);
      letterField.noStroke();
      letterField.textFont('Space Grotesk, sans-serif');
      letterField.textAlign(p.CENTER, p.CENTER);
      letterField.textStyle(p.BOLD);
      letterField.textSize(rows * 0.62);
      letterField.text('AP', cols / 2, rows / 2 + rows * 0.03);
      letterField.loadPixels(); // habilita la lectura de letterField.pixels[]

      // --- Una entrada por celda ------------------------------------------
      cells = [];
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          // Centro de la celda en coordenadas del canvas: esta es la
          // posición que uso como destino de la letra (lx, ly) y también la
          // base sobre la que el ruido calcula el desplazamiento disperso.
          const fx = (i + 0.5) * cellSize;
          const fy = (j + 0.5) * cellSize;

          // Leo el pixel correspondiente en el buffer de la letra. Cada
          // pixel ocupa 4 valores en el array (R, G, B, A); como dibujé en
          // blanco y negro, con mirar el canal R alcanza.
          const idx = (j * cols + i) * 4;
          const bright = letterField.pixels[idx];
          const isLetter = bright > 120; // umbral: blanco = forma parte de "AP"

          cells.push({
            fx, fy,                 // posición base en la grilla
            lx: fx, ly: fy,         // posición objetivo dentro de la letra
            isLetter,               // ¿esta celda es parte de "AP"?
            gi: i, gj: j,           // coordenadas de grilla (para el ruido)
            phase: p.random(1000),  // desfasaje individual → movimiento no sincronizado
            jitterSeed: p.random(1000)
          });
        }
      }
    }

    // ----------------------------------------------------------------------
    // setup(): se ejecuta una sola vez al cargar.
    // ----------------------------------------------------------------------
    p.setup = () => {
      const canvas = p.createCanvas(container.clientWidth, container.clientHeight);
      canvas.parent(container); // el canvas de p5 vive dentro del div del hero
      p.pixelDensity(Math.min(window.devicePixelRatio || 1, 2)); // nitidez sin gastar de más en pantallas retina
      p.textFont('Space Grotesk, sans-serif');
      p.noStroke();
      startTime = p.millis();
      buildGrid();
    };

    // Si la ventana cambia de tamaño, recalculo todo desde cero para que la
    // grilla y la letra sigan encajando con el nuevo tamaño del hero.
    p.windowResized = () => {
      if (!container.clientWidth || !container.clientHeight) return;
      p.resizeCanvas(container.clientWidth, container.clientHeight);
      buildGrid();
    };

    // ----------------------------------------------------------------------
    // draw(): se ejecuta en cada frame (idealmente 60 veces por segundo).
    // ----------------------------------------------------------------------
    p.draw = () => {
      p.clear(); // fondo transparente: se ve el fondo oscuro del CSS por detrás

      // ---- 1. ¿En qué punto del ciclo estoy? ------------------------------
      const elapsed = (p.millis() - startTime) % CYCLE; // tiempo dentro del ciclo actual
      let morph = 0; // 0 = totalmente disperso · 1 = "AP" totalmente formado

      if (elapsed < T_DISPERSED) {
        // Fase 1: caos total, morph fijo en 0.
        morph = 0;
      } else if (elapsed < T_DISPERSED + T_TO_LETTERS) {
        // Fase 2: transición de disperso → letra, con easing.
        const t = (elapsed - T_DISPERSED) / T_TO_LETTERS;
        morph = easeInOutCubic(t);
      } else if (elapsed < T_DISPERSED + T_TO_LETTERS + T_HOLD) {
        // Fase 3: "AP" se mantiene formado.
        morph = 1;
      } else if (elapsed < T_DISPERSED + T_TO_LETTERS + T_HOLD + T_BREAK) {
        // Fase 4: transición de letra → disperso (el camino inverso).
        const t = (elapsed - T_DISPERSED - T_TO_LETTERS - T_HOLD) / T_BREAK;
        morph = 1 - easeInOutCubic(t);
      } else {
        // Fase 5: caos de cola, antes de que el ciclo arranque de nuevo.
        morph = 0;
      }

      // ---- 2. Parámetros de tiempo para el ruido -------------------------
      const t = p.millis() * 0.00035; // "reloj" lento que alimenta el ruido, para que el patrón fluya
      const noiseScale = 0.09;        // qué tan "zoomeado" está el campo de ruido sobre la grilla

      // ---- 3. Recorro cada carácter y lo dibujo ---------------------------
      for (let k = 0; k < cells.length; k++) {
        const c = cells[k];

        // Campo escalar tipo "marching squares": combino ruido Perlin
        // (suave y orgánico) con una onda seno/coseno (más rítmica) para
        // que el resultado tenga tanto fluidez como una cadencia perceptible.
        const n = p.noise(c.gi * noiseScale, c.gj * noiseScale, t + c.jitterSeed * 0.01);
        const wave = Math.sin(t * 2.2 + c.gi * 0.18 + c.gj * 0.22) * 0.5 + 0.5;
        const field = (n * 0.7 + wave * 0.3); // valor final del campo en esta celda, entre 0 y 1

        // Posición dispersa: parto de la celda "empujada" en una dirección
        // que depende del propio campo (como si el viento del campo la
        // arrastrara), con una amplitud proporcional al tamaño de celda.
        const angle = n * Math.PI * 4;
        const disperseAmp = cellSize * 2.6;
        const dx = Math.cos(angle) * disperseAmp * (field - 0.5);
        const dy = Math.sin(angle) * disperseAmp * (field - 0.5);

        const dispX = c.fx + dx;
        const dispY = c.fy + dy;

        // Posición final: interpolo entre la posición dispersa y el
        // destino, según si esta celda pertenece o no a la letra.
        let targetX, targetY, alphaMul;

        if (c.isLetter) {
          // Las celdas que SÍ forman parte de "AP" migran hacia su
          // posición fija dentro de la letra a medida que morph → 1.
          targetX = p.lerp(dispX, c.lx, morph);
          targetY = p.lerp(dispY, c.ly, morph);
          alphaMul = 1;
        } else {
          // Las celdas que NO son parte de la letra se alejan un poco más
          // (empuje extra) mientras la letra se forma, para que el
          // contraste entre "letra" y "ruido de fondo" se lea con claridad.
          const pushAmp = cellSize * 3.2 * morph;
          const pushAngle = n * Math.PI * 2 + c.jitterSeed;
          targetX = dispX + Math.cos(pushAngle) * pushAmp;
          targetY = dispY + Math.sin(pushAngle) * pushAmp;
          alphaMul = p.lerp(1, 0.18, morph); // se atenúan para no competir visualmente con la letra
        }

        // Agrego un pequeño temblor permanente (independiente del morph)
        // para que incluso la letra ya formada se sienta "viva" y no
        // estática.
        const microJitter = 1.1;
        const jx = Math.sin(t * 3 + c.phase) * microJitter;
        const jy = Math.cos(t * 2.4 + c.phase) * microJitter;

        const px = targetX + jx;
        const py = targetY + jy;

        // Si el carácter quedó fuera del área visible, ni lo dibujo (ahorra
        // trabajo y evita "pop-in" en los bordes).
        if (px < -cellSize || px > w + cellSize || py < -cellSize || py > h + cellSize) continue;

        // El carácter en sí (., :, +, *, #, █) lo elijo según el valor del
        // campo: valores bajos → caracteres "livianos", valores altos →
        // caracteres "densos". Esto es lo que le da la textura tipo mapa de
        // contornos, más allá del movimiento.
        const bucket = Math.floor(field * CHARSET.length) % CHARSET.length;
        const char = CHARSET[bucket];

        // Cuando la letra está bien formada (morph > 0.55), la hago brillar
        // un poco más fuerte y con el tono "glow" en vez del verde base.
        const baseAlpha = (0.35 + field * 0.5) * alphaMul;
        const isBright = c.isLetter && morph > 0.55;

        const size = cellSize * (isBright ? 1.05 : 0.86);
        p.textSize(size);
        p.textAlign(p.CENTER, p.CENTER);

        if (isBright) {
          p.fill(134, 230, 184, 255 * Math.min(baseAlpha * 1.3, 1)); // var(--glow) en RGB
        } else {
          p.fill(74, 222, 156, 255 * baseAlpha); // var(--green) en RGB
        }

        p.text(char, px, py);
      }
    };
  };

  if (!prefersReducedMotion) {
    // eslint-disable-next-line no-new
    new p5(sketch);
  } else {
    // Alternativa estática para quien prefiere menos movimiento en pantalla:
    // dejo un resplandor suave y fijo, sin animación.
    container.style.background =
      'radial-gradient(circle at 50% 50%, rgba(74,222,156,0.08), transparent 70%)';
  }
})();
