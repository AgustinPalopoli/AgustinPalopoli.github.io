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
   ============================================================================ */
(() => {
  'use strict';

  const container = document.getElementById('scene-canvas-container');
  if (!container || typeof p5 === 'undefined') return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const getCanvasSize = () => {
    const parent = container.parentElement;
    const width = container.clientWidth || parent?.clientWidth || window.innerWidth || 1;
    const height = container.clientHeight || parent?.clientHeight || window.innerHeight || 1;
    return { width, height };
  };

  const sketch = (p) => {
    let w, h;
    let radius;

    // Paleta del sitio (el mismo verde "jade" que uso en el resto de la página).
    const GREEN   = [74, 222, 156];
    const GREEN_2 = [47, 174, 121];
    const DARK    = [11, 11, 11];

    // Estado de la interacción de click (expandir/contraer anillos).
    let expanded = false;
    let offsetAmount = 0;
    let pressPos = null;

    const isInsideCanvas = () =>
      p.mouseX >= 0 && p.mouseX <= w && p.mouseY >= 0 && p.mouseY <= h;

    p.setup = () => {
      const size = getCanvasSize();
      w = size.width;
      h = size.height;

      const canvas = p.createCanvas(w, h, p.WEBGL);
      canvas.parent(container);
      p.pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
      p.angleMode(p.DEGREES);
      p.strokeWeight(1.1);

      radius = Math.min(w, h) * 0.34;

      // Dejo que la página siga haciendo scroll vertical, incluso cuando el
      // cursor está sobre la escena. El arrastre sigue funcionando para girar.
      canvas.elt.style.touchAction = 'pan-y';
      canvas.elt.addEventListener('wheel', (event) => {
        event.stopImmediatePropagation();
      }, { capture: true, passive: true });

      // Pongo el cursor de mano solo mientras el mouse está sobre el canvas,
      // como pista de que se puede clickear para expandir la esfera.
      canvas.elt.style.cursor = 'pointer';
    };

    p.windowResized = () => {
      const size = getCanvasSize();
      w = size.width;
      h = size.height;
      p.resizeCanvas(w, h);
      radius = Math.min(w, h) * 0.34;
    };

    // --------------------------------------------------------------------
    // Detección de click "real": guardo dónde se apretó el mouse y, al
    // soltarlo, solo togglea si no hubo arrastre significativo (así no
    // interfiere con orbitControl).
    // --------------------------------------------------------------------
    p.mousePressed = () => {
      if (isInsideCanvas()) {
        pressPos = { x: p.mouseX, y: p.mouseY };
      }
    };

    p.mouseReleased = () => {
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

      // Arrastrar orbita la cámara; la rueda del mouse no queda atrapada por
      // la escena (ver el listener de "wheel" en setup).
      p.orbitControl(1, 1, 0);

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
      const ringStep = 10;  // cuántos grados salta entre anillo y anillo
      const cubeStep = 10;  // cuántos grados salta entre pico y pico dentro de un anillo

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

  if (!prefersReducedMotion) {
    // eslint-disable-next-line no-new
    new p5(sketch);
  } else {
    container.style.background =
      'radial-gradient(circle at 50% 50%, rgba(47,174,121,0.08), transparent 70%)';
  }
})();
