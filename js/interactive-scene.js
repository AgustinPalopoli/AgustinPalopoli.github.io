/* ============================================================================
   interactive-scene.js
   ----------------------------------------------------------------------------
   Acá fusioné dos ideas en una sola escena WEBGL:

   1) La esfera de anillos de cubos que "respira" sola (pulso de tamaño +
      rotación individual por cubo + degradé entre dos verdes), integrada al
      layout del sitio (canvas responsive, respeta prefers-reduced-motion,
      deja pasar el scroll de la página).

   2) La esfera sólida central + los "picos" (cubo con un cono arriba, como
      un erizo) + la interacción de click que expande/contrae los anillos
      hacia afuera.

   El click para expandir lo detecto comparando la posición del mouse al
   presionar vs al soltar (no con el evento "click" nativo), para que no se
   dispare por accidente cuando el usuario arrastra para orbitar la cámara.

   MODO CELULAR
   ----------------------------------------------------------------------------
   En celular la escena se comporta distinto, por dos problemas que tenía:
     - Rendimiento: con 648 picos se trababa. Ahí uso menos anillos y menos
       picos por anillo (ver DENSITY).
     - Scroll: orbitControl() giraba la esfera en cualquier dirección, así que
       al querer bajar por la página se giraba la escena en vez de scrollear.
   Entonces, en modo celular NO uso orbitControl: manejo el giro yo con
   eventos de puntero. En la escena normal solo gira de costado (el movimiento
   vertical del dedo queda libre para scrollear la página). Con el botón
   "Agrandar" la escena pasa a pantalla completa y ahí sí gira hacia cualquier
   lado; el botón "Cerrar" (o la tecla Esc) la devuelve a su lugar.
   ============================================================================ */
(() => {
  'use strict';

  const container = document.getElementById('scene-canvas-container');
  if (!container) return;

  const scene = container.closest('.scene');

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Si la animación no va a correr, marco la sección para que el CSS
  // esconda los botones de agrandar/cerrar (no tendrían nada que mostrar).
  if (prefersReducedMotion || typeof p5 === 'undefined') {
    if (scene) scene.classList.add('is-static');
    if (prefersReducedMotion) {
      container.style.background =
        'radial-gradient(circle at 50% 50%, rgba(47,174,121,0.08), transparent 70%)';
    }
    return;
  }

  // "Modo celular": pantallas chicas o dispositivos táctiles. Es la misma
  // condición que usa el CSS para mostrar los botones de la escena.
  const compactQuery = window.matchMedia('(max-width: 760px), (hover: none), (pointer: coarse)');
  const isCompact = () => compactQuery.matches;

  // Cantidad de picos: un anillo cada `ringStep` grados (de 0 a 180) y un
  // pico cada `cubeStep` grados dentro del anillo (de 0 a 360).
  //   normal  → 18 anillos x 36 picos = 648
  //   celular → 15 anillos x 24 picos = 360 (casi la mitad de trabajo)
  // Si en celular todavía se traba, subir estos números; si sobra rendimiento,
  // bajarlos.
  const DENSITY = {
    full:    { ringStep: 10, cubeStep: 10 },
    compact: { ringStep: 12, cubeStep: 15 }
  };

  // Grados de giro por pixel que arrastra el dedo (modo celular).
  const DRAG_SENSITIVITY = 0.45;

  const enlargeBtn = document.getElementById('scene-enlarge');
  const closeBtn = document.getElementById('scene-close');

  const getCanvasSize = () => {
    const parent = container.parentElement;
    const width = container.clientWidth || parent?.clientWidth || window.innerWidth || 1;
    const height = container.clientHeight || parent?.clientHeight || window.innerHeight || 1;
    return { width, height };
  };

  const sketch = (p) => {
    let w, h;
    let radius;
    let canvasEl;

    // Paleta del sitio (el mismo verde "jade" que uso en el resto de la página).
    const GREEN   = [74, 222, 156];
    const GREEN_2 = [47, 174, 121];
    const DARK    = [11, 11, 11];

    // Estado de la interacción de click (expandir/contraer anillos).
    let expanded = false;
    let offsetAmount = 0;
    let pressPos = null;

    // Estado del modo celular.
    let enlarged = false;        // escena agrandada a pantalla completa
    let yaw = 0;                 // giro manual de costado, en grados
    let pitch = 0;               // giro manual vertical, en grados (solo agrandada)
    let dragId = null;           // id del puntero que está arrastrando
    let lastX = 0, lastY = 0;    // última posición del dedo (para calcular el delta)
    let tapStart = null;         // dónde empezó el toque (para distinguir tap de arrastre)

    const isInsideCanvas = () =>
      p.mouseX >= 0 && p.mouseX <= w && p.mouseY >= 0 && p.mouseY <= h;

    // touch-action le avisa al navegador qué gestos son suyos:
    //  - 'pan-y': el scroll vertical es del navegador (la página baja) y el
    //    movimiento horizontal me llega a mí para girar la esfera.
    //  - 'none': todos los gestos son míos (escena agrandada, no hay nada
    //    que scrollear).
    const applyTouchAction = () => {
      if (!canvasEl) return;
      canvasEl.style.touchAction = isCompact() && enlarged ? 'none' : 'pan-y';
    };

    // Ajusta el canvas al tamaño real del contenedor. Si el tamaño no cambió
    // no hago nada: en celular el navegador dispara "resize" cada vez que la
    // barra de direcciones aparece o desaparece, y no quiero recrear el
    // canvas por eso.
    const fitToContainer = () => {
      const size = getCanvasSize();
      if (size.width === w && size.height === h) return;
      w = size.width;
      h = size.height;
      p.resizeCanvas(w, h);
      radius = Math.min(w, h) * 0.34;
    };

    // Agranda / cierra la escena (solo modo celular).
    const setEnlarged = (value) => {
      if (enlarged === value) return;
      enlarged = value;
      scene.classList.toggle('is-enlarged', enlarged);
      document.body.classList.toggle('scene-enlarged', enlarged);
      applyTouchAction();
      // El ResizeObserver (ver setup) ajusta el canvas al nuevo tamaño; acá
      // solo muevo el foco al botón que ahora corresponde.
      const next = enlarged ? closeBtn : enlargeBtn;
      if (next) next.focus({ preventScroll: true });
    };

    p.setup = () => {
      const size = getCanvasSize();
      w = size.width;
      h = size.height;

      const canvas = p.createCanvas(w, h, p.WEBGL);
      canvas.parent(container);
      canvasEl = canvas.elt;
      p.pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
      p.angleMode(p.DEGREES);
      p.strokeWeight(1.1);

      radius = Math.min(w, h) * 0.34;

      // Dejo que la página siga haciendo scroll vertical, incluso cuando el
      // cursor está sobre la escena. El arrastre sigue funcionando para girar.
      applyTouchAction();
      canvasEl.addEventListener('wheel', (event) => {
        event.stopImmediatePropagation();
      }, { capture: true, passive: true });

      // Pongo el cursor de mano solo mientras el mouse está sobre el canvas,
      // como pista de que se puede clickear para expandir la esfera.
      canvasEl.style.cursor = 'pointer';

      // --- Controles del modo celular -----------------------------------
      // Uso eventos de puntero (sirven para dedo y mouse). En modo desktop
      // estos handlers salen enseguida y sigue mandando orbitControl().
      canvasEl.addEventListener('pointerdown', (e) => {
        if (!isCompact() || dragId !== null) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        dragId = e.pointerId;
        lastX = e.clientX;
        lastY = e.clientY;
        tapStart = { x: e.clientX, y: e.clientY };
        canvasEl.setPointerCapture(e.pointerId);
      });

      canvasEl.addEventListener('pointermove', (e) => {
        if (e.pointerId !== dragId) return;
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;

        // Giro de costado: siempre. Giro vertical: solo con la escena
        // agrandada (en la normal, el vertical es para scrollear la página).
        yaw += dx * DRAG_SENSITIVITY;
        if (enlarged) {
          pitch = p.constrain(pitch - dy * DRAG_SENSITIVITY, -90, 90);
        }
      });

      const endDrag = (e, cancelled) => {
        if (e.pointerId !== dragId) return;
        // Un toque corto, sin arrastre, expande/contrae los picos. Si el
        // navegador canceló el gesto (porque empezó a scrollear) no cuenta.
        if (!cancelled && tapStart &&
            Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y) < 6) {
          expanded = !expanded;
        }
        dragId = null;
        tapStart = null;
      };
      canvasEl.addEventListener('pointerup', (e) => endDrag(e, false));
      canvasEl.addEventListener('pointercancel', (e) => endDrag(e, true));

      // --- Botones agrandar / cerrar ------------------------------------
      if (enlargeBtn) enlargeBtn.addEventListener('click', () => setEnlarged(true));
      if (closeBtn) closeBtn.addEventListener('click', () => setEnlarged(false));
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && enlarged) setEnlarged(false);
      });

      // Si cambia el modo (gira el celular, se agranda la ventana...) cierro
      // la escena agrandada cuando deja de corresponder y actualizo el touch-action.
      compactQuery.addEventListener('change', () => {
        if (!isCompact() && enlarged) setEnlarged(false);
        applyTouchAction();
      });

      // El contenedor cambia de tamaño al agrandar/cerrar la escena y al
      // girar el celular: el canvas lo sigue automáticamente.
      if ('ResizeObserver' in window) {
        new ResizeObserver(fitToContainer).observe(container);
      }
    };

    p.windowResized = fitToContainer;

    // --------------------------------------------------------------------
    // Detección de click "real" con mouse (modo desktop): guardo dónde se
    // apretó el mouse y, al soltarlo, solo togglea si no hubo arrastre
    // significativo (así no interfiere con orbitControl). En modo celular
    // esto lo resuelven los eventos de puntero de arriba, y acá salgo para
    // no contar el mismo toque dos veces.
    // --------------------------------------------------------------------
    p.mousePressed = () => {
      if (isCompact()) return;
      if (isInsideCanvas()) {
        pressPos = { x: p.mouseX, y: p.mouseY };
      }
    };

    p.mouseReleased = () => {
      if (isCompact()) return;
      if (pressPos && isInsideCanvas()) {
        const moved = p.dist(pressPos.x, pressPos.y, p.mouseX, p.mouseY);
        if (moved < 6) {
          expanded = !expanded;
        }
      }
      pressPos = null;
    };

    p.draw = () => {
      p.background(5, 5, 5);

      // Iluminación jade: ambiente + direccional (simula el sol) + dos
      // puntuales de color para que los cubos y la esfera central tengan
      // brillo y profundidad.
      p.ambientLight(18, 40, 30);
      p.directionalLight(GREEN[0], GREEN[1], GREEN[2], -0.4, 0.6, -0.5);
      p.pointLight(GREEN_2[0], GREEN_2[1], GREEN_2[2], 0, -radius * 1.3, radius);
      p.pointLight(20, 60, 40, -radius, radius * 0.6, -radius * 0.6);

      // Desktop: arrastrar orbita la cámara; la rueda del mouse no queda
      // atrapada por la escena (ver el listener de "wheel" en setup).
      // Celular: no uso orbitControl; el giro viene de yaw/pitch (arriba).
      // Al cerrar la escena agrandada, pitch vuelve suavemente a 0 para que
      // la esfera quede derecha otra vez.
      if (!isCompact()) {
        p.orbitControl(1, 1, 0);
      } else if (!enlarged) {
        pitch = p.lerp(pitch, 0, 0.12);
      }
      p.rotateX(pitch);
      p.rotateY(yaw);

      // Rotación lenta y constante de toda la escena, para que "respire"
      // incluso si nadie interactúa con ella.
      const t = p.millis() * 0.001;
      p.rotateY(t * 6);
      p.rotateX(Math.sin(t * 0.25) * 6);

      // Transición suave entre "cerrado" y "expandido" al hacer click.
      const target = expanded ? radius * 0.6 : 0;
      offsetAmount = p.lerp(offsetAmount, target, 0.08);

      // --------------------------------------------------------------------
      // Núcleo: esfera sólida jade en el centro, con su propio pulso y
      // rotación, como si fuera el "corazón" de la estructura de cubos.
      // --------------------------------------------------------------------
      p.push();
      const corePulse = Math.sin(t * 1.6) * 0.5 + 0.5;
      const coreSize = p.map(corePulse, 0, 1, radius * 0.16, radius * 0.2);
      p.rotateY(t * 40);
      p.noStroke();
      p.ambientMaterial(DARK[0], DARK[1], DARK[2]);
      p.specularMaterial(GREEN[0], GREEN[1], GREEN[2]);
      p.shininess(80);
      p.sphere(coreSize, 24, 24);
      p.pop();

      // --------------------------------------------------------------------
      // Construcción de la esfera de anillos: un anillo de picos (cubo +
      // cono) es un cubo repetido en círculo (xAngle de 0 a 360); la esfera
      // completa es ese anillo repetido en semicírculo (zAngle de 0 a 180).
      // --------------------------------------------------------------------
      const { ringStep, cubeStep } = isCompact() ? DENSITY.compact : DENSITY.full;

      for (let zAngle = 0; zAngle < 180; zAngle += ringStep) {
        // Progreso 0→1 a lo largo de la esfera (de "polo" a "polo"), lo uso
        // para el degradé de color entre los dos verdes.
        const ringProgress = zAngle / 180;

        for (let xAngle = 0; xAngle < 360; xAngle += cubeStep) {
          p.push();

          // Ubico cada pico sobre la superficie de la esfera, desplazado
          // hacia afuera cuando la escena está "expandida".
          p.rotateZ(zAngle);
          p.rotateX(xAngle);
          p.translate(0, radius + offsetAmount, 0);

          // Variación de tamaño por cubo: semilla fija (tamaño "base" propio
          // de cada cubo) + pulsación lenta en el tiempo, para que toda la
          // esfera parezca respirar.
          const seed = (zAngle * 13 + xAngle * 7) % 360;
          const pulse = Math.sin(t * 1.4 + seed * 0.1) * 0.5 + 0.5;
          const size = p.map(pulse, 0, 1, radius * 0.05, radius * 0.11);

          // Cada cubo gira sobre sí mismo a su propio ritmo.
          p.rotateY(t * 30 + seed);

          // Degradé de color: los picos cerca de un polo tienden a GREEN,
          // los del otro polo a GREEN_2.
          const r = p.lerp(GREEN[0], GREEN_2[0], ringProgress);
          const g = p.lerp(GREEN[1], GREEN_2[1], ringProgress);
          const bl = p.lerp(GREEN[2], GREEN_2[2], ringProgress);

          // Cubo con relleno leve, como en el original.
          p.ambientMaterial(DARK[0], DARK[1], DARK[2]);
          p.specularMaterial(r, g, bl);
          p.shininess(50);
          p.stroke(r, g, bl, 140);
          p.strokeWeight(1.1);
          p.noFill();
          p.box(size);

          // Cono apuntando hacia afuera, como una espina, sobre cada cubo.
          p.noFill();
          p.stroke(r, g, bl, 200);
          p.strokeWeight(2);
          p.translate(0, size * 0.9, 0);
          p.cone(size * 0.4, size * 0.7, 6, 1);

          p.pop();
        }
      }
    };
  };

  // eslint-disable-next-line no-new
  new p5(sketch);
})();
