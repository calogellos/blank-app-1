(() => {
  const canvas = document.getElementById("scene");
  const ctx = canvas.getContext("2d");

  const BG_COLOR = "#4b5596";
  const HEART_COLOR = "#d8d6c8";

  let width = window.innerWidth;
  let height = window.innerHeight;
  let dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));

  function resizeCanvas() {
    width = window.innerWidth;
    height = window.innerHeight;
    dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = false;

    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, width, height);
  }

  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  // ------------------------------------------------------
  // Entrada: corazón sigue al mouse / toque
  // ------------------------------------------------------
  const mouse = {
    x: width * 0.5,
    y: height * 0.5,
  };

  function updatePointerFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    if (e.touches && e.touches.length > 0) {
      const t = e.touches[0];
      mouse.x = t.clientX - rect.left;
      mouse.y = t.clientY - rect.top;
    } else {
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    }
  }

  canvas.addEventListener("mousemove", (e) => {
    updatePointerFromEvent(e);
  });

  canvas.addEventListener(
    "touchmove",
    (e) => {
      e.preventDefault();
      updatePointerFromEvent(e);
    },
    { passive: false }
  );

  canvas.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      updatePointerFromEvent(e);
    },
    { passive: false }
  );

  // ------------------------------------------------------
  // Sistema de corazón con partículas tipo pixel
  // ------------------------------------------------------
  class HeartSystem {
    constructor(target, color) {
      this.target = target;
      this.color = color;
      this.center = { x: target.x, y: target.y };
      this.particles = [];
      this.localPoints = this.buildPixelHeartPoints();
      this.pulseScale = 1;
    }

    buildPixelHeartPoints() {
      // Mapa simple de corazón en cuadrícula (pixel art)
      const pattern = [
        "..11...11..",
        ".1111.1111.",
        ".111111111.",
        ".111111111.",
        "..1111111..",
        "...11111...",
        "....111....",
        ".....1.....",
      ];
      const points = [];
      const rows = pattern.length;
      const cols = pattern[0].length;
      const spacing = 3; // distancia entre "pixeles" internos

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (pattern[y][x] === "1") {
            const offsetX = (x - cols / 2) * spacing;
            const offsetY = (y - rows / 2) * spacing;
            points.push({ x: offsetX, y: offsetY });
          }
        }
      }

      return points;
    }

    update(dt, nowMs) {
      // Suaviza el movimiento del corazón hacia el mouse
      const follow = 0.18;
      this.center.x += (this.target.x - this.center.x) * follow;
      this.center.y += (this.target.y - this.center.y) * follow;

      // Pequeño "latido" con escala
      const t = nowMs * 0.008; // frecuencia de latido
      this.pulseScale = 1 + 0.1 * Math.sin(t);

      // Generar partículas basado en los puntos del corazón
      const spawnCount = 3;
      for (let i = 0; i < spawnCount; i++) {
        const base =
          this.localPoints[
            (Math.random() * this.localPoints.length) | 0
          ];
        const px =
          this.center.x + base.x * this.pulseScale + (Math.random() - 0.5) * 3;
        const py =
          this.center.y + base.y * this.pulseScale + (Math.random() - 0.5) * 3;

        const angle = Math.random() * Math.PI * 2;
        const speed = 25 + Math.random() * 35;

        this.particles.push({
          x: px,
          y: py,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0,
          maxLife: 0.5 + Math.random() * 0.4,
          size: 3 + Math.random() * 1.5,
        });
      }

      // Actualizar partículas existentes
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.life += dt;
        if (p.life >= p.maxLife) {
          this.particles.splice(i, 1);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    }

    draw(ctx) {
      // Corazón "central" definido por pixeles
      ctx.fillStyle = this.color;
      const unit = 2.5;
      for (const pt of this.localPoints) {
        const x =
          this.center.x + pt.x * this.pulseScale - unit * 0.5;
        const y =
          this.center.y + pt.y * this.pulseScale - unit * 0.5;
        ctx.fillRect(x, y, unit, unit);
      }

      // Partículas con alpha
      for (const p of this.particles) {
        const alpha = 1 - p.life / p.maxLife;
        ctx.fillStyle = `rgba(216,214,200,${alpha.toFixed(3)})`;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }
    }

    getPosition() {
      return { x: this.center.x, y: this.center.y };
    }
  }

  // ------------------------------------------------------
  // Gato pixel art con 2 frames de caminata
  // ------------------------------------------------------
  class Cat {
    constructor(initialPosition) {
      const { x, y } = initialPosition;
      this.x = x + 120;
      this.y = y + 80;

      this.vx = 0;
      this.vy = 0;
      this.maxSpeed = 95; // velocidad máxima baja
      this.followLerp = 0.04; // inercia / suavizado
      this.direction = 1; // 1 = mira derecha, -1 = mira izquierda

      this.pixelSize = 3.5; // tamaño del "pixel" del gato
      this.frameIndex = 0; // 0 y 1 para caminar
      this.walkTimer = 0;
      this.tailPhase = 0;
    }

    update(dt, targetX, targetY) {
      const dx = targetX - this.x;
      const dy = targetY - this.y;
      const dist = Math.hypot(dx, dy) || 1;

      const targetVx = (dx / dist) * this.maxSpeed;
      const targetVy = (dy / dist) * this.maxSpeed;

      // Movimiento con inercia
      this.vx += (targetVx - this.vx) * this.followLerp;
      this.vy += (targetVy - this.vy) * this.followLerp;

      // Limitar velocidad
      const vMag = Math.hypot(this.vx, this.vy);
      if (vMag > this.maxSpeed) {
        this.vx = (this.vx / vMag) * this.maxSpeed;
        this.vy = (this.vy / vMag) * this.maxSpeed;
      }

      this.x += this.vx * dt;
      this.y += this.vy * dt;

      // Orientación del gato
      if (Math.abs(this.vx) > 1) {
        this.direction = this.vx >= 0 ? 1 : -1;
      }

      const moving = vMag > 5;

      // Animación de patas (2 frames)
      if (moving) {
        this.walkTimer += dt;
        const frameDuration = 0.18;
        if (this.walkTimer > frameDuration) {
          this.walkTimer = 0;
          this.frameIndex = (this.frameIndex + 1) % 2;
        }
      } else {
        this.walkTimer = 0;
        this.frameIndex = 0;
      }

      // Cola con movimiento ligero
      this.tailPhase += dt * (moving ? 8 : 4);
    }

    draw(ctx) {
      const u = this.pixelSize;
    
      ctx.save();
      ctx.translate(this.x, this.y);
    
      // Sombra elíptica debajo
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = "#000000";
      ctx.beginPath();
      ctx.ellipse(0, 0, 7 * u, 4 * u, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    
      // Subir el gato sobre la sombra
      ctx.translate(0, -9 * u);
    
      // Mirar en dirección del movimiento
      if (this.direction === -1) {
        ctx.scale(-1, 1);
      }
    
      const base = "#e67e22";  // naranja base
      const dark = "#d35400";  // naranja oscuro
      const light = "#f5b041"; // naranja claro (cara)
      const belly = "#f8c471"; // barriga
      const black = "#000000"; // contornos / ojos
      const blush = "#e8a39b"; // NUEVO: rubor suave (1 color nuevo)
      const eyeWhite = "#fdfaf0"; // reutiliza blanco casi del globo / luz
    
      // Cola con wag
      const wagOffset = Math.sin(this.tailPhase) * 1.1 * u;
      ctx.fillStyle = base;
      const tailBaseX = 6 * u;
      const tailBaseY = -2 * u;
      for (let i = 0; i < 4; i++) {
        const tx = tailBaseX + wagOffset * (i / 4);
        const ty = tailBaseY - i * 2 * u;
        ctx.fillRect(tx, ty, 2 * u, 2 * u);
      }
      ctx.fillStyle = dark;
      ctx.fillRect(tailBaseX, tailBaseY, 2 * u, 2 * u);
    
      // Cuerpo (ligeramente más bajo para que la cabeza domine)
      ctx.fillStyle = base;
      ctx.fillRect(-6 * u, -4 * u, 12 * u, 7 * u); // antes -5* u ,8*u
      ctx.fillStyle = belly;
      ctx.fillRect(-4 * u, -2 * u, 8 * u, 3 * u);
    
      // Cabeza un pelín más alta
      ctx.fillStyle = base;
      ctx.fillRect(-7 * u, -12 * u, 14 * u, 8 * u);
    
      // Orejas
      ctx.fillRect(-7 * u, -14 * u, 3 * u, 3 * u);
      ctx.fillRect(4 * u, -14 * u, 3 * u, 3 * u);
      ctx.fillStyle = dark;
      ctx.fillRect(-7 * u, -14 * u, 1 * u, 3 * u);
      ctx.fillRect(6 * u, -14 * u, 1 * u, 3 * u);
    
      // Zona clara de la cara (un poco más grande)
      ctx.fillStyle = light;
      ctx.fillRect(-5 * u, -10 * u, 10 * u, 5 * u);
    
      // OJOS GRANDES, CERCA Y CON BRILLO
      //
      // Base negra de ojo, 3x3 píxeles (más cuadrados)
      ctx.fillStyle = black;
      // ojo izquierdo
      ctx.fillRect(-4 * u, -9 * u, 3 * u, 3 * u);
      // ojo derecho (un poco más cerca al centro)
      ctx.fillRect(1 * u, -9 * u, 3 * u, 3 * u);
    
      // Brillo blanco en la esquina superior de cada ojo
      ctx.fillStyle = eyeWhite;
      ctx.fillRect(-4 * u, -9 * u, 1 * u, 1 * u); // brillo ojo izq
      ctx.fillRect(1 * u, -9 * u, 1 * u, 1 * u);  // brillo ojo der
    
      // PEQUEÑA NARIZ MÁS CHIQUITA Y OSCURA, CENTRADA
      ctx.fillStyle = dark;
      ctx.fillRect(-1 * u, -7 * u, 2 * u, 1 * u); // 2x1, centrada
    
      // BOCA "uwu" / sonrisa curva (3 píxeles)
      //
      //  .x.
      // x...x
      ctx.fillStyle = black;
      // centro ligeramente más arriba
      ctx.fillRect(0 * u, -6 * u, 1 * u, 1 * u);      // centro
      ctx.fillRect(-2 * u, -5 * u, 1 * u, 1 * u);     // lado izq
      ctx.fillRect(2 * u, -5 * u, 1 * u, 1 * u);      // lado der
    
      // LIGERO RUBOR (blush) bajo los ojos
      ctx.fillStyle = blush;
      ctx.fillRect(-5 * u, -7 * u, 2 * u, 1 * u);     // mejilla izq
      ctx.fillRect(3 * u, -7 * u, 2 * u, 1 * u);      // mejilla der
    
      // Bigotes (ligeramente más bajos para seguir la nueva cara)
      ctx.fillStyle = black;
      ctx.fillRect(-7 * u, -7 * u, 2 * u, 1 * u);
      ctx.fillRect(-7 * u, -6 * u, 2 * u, 1 * u);
      ctx.fillRect(5 * u, -7 * u, 2 * u, 1 * u);
      ctx.fillRect(5 * u, -6 * u, 2 * u, 1 * u);
    
      // Patas (mismo sistema de 2 frames)
      ctx.fillStyle = dark;
    
      if (this.frameIndex === 0) {
        // delanteras
        ctx.fillRect(-5 * u, 2 * u, 2 * u, 3 * u);
        ctx.fillRect(1 * u, 1 * u, 2 * u, 4 * u);
        // traseras
        ctx.fillRect(-2 * u, 2 * u, 2 * u, 3 * u);
        ctx.fillRect(4 * u, 1 * u, 2 * u, 4 * u);
      } else {
        // delanteras
        ctx.fillRect(-5 * u, 1 * u, 2 * u, 4 * u);
        ctx.fillRect(1 * u, 2 * u, 2 * u, 3 * u);
        // traseras
        ctx.fillRect(-2 * u, 1 * u, 2 * u, 4 * u);
        ctx.fillRect(4 * u, 2 * u, 2 * u, 3 * u);
      }
    
      ctx.restore();
    }
  }

  // ------------------------------------------------------
  // Globo de diálogo "Te amo"
  // ------------------------------------------------------
  class SpeechBubbleManager {
    constructor() {
      this.active = null;
      this.cooldownUntil = 0;
    }

    trigger(nowMs) {
      const duration = 1700; // 1.7 s aprox
      if (nowMs < this.cooldownUntil) return;

      this.active = {
        start: nowMs,
        duration,
      };
      this.cooldownUntil = nowMs + duration + 400; // pequeño descanso
    }

    update(nowMs) {
      if (!this.active) return;
      if (nowMs - this.active.start > this.active.duration) {
        this.active = null;
      }
    }

    draw(ctx, cat, nowMs) {
      if (!this.active) return;

      const t =
        (nowMs - this.active.start) / this.active.duration;
      if (t >= 1) return;

      // Pop-in suave y flotación ligera
      const scale = t < 0.2 ? 0.6 + (t / 0.2) * 0.4 : 1;
      const floatY = -8 * Math.sin(t * Math.PI);
      const alpha = t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2;

      const baseX = cat.x + (cat.direction === 1 ? 70 : -70);
      const baseY = cat.y - 90;

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.translate(baseX, baseY + floatY);
      ctx.scale(scale, scale);

      const w = 110;
      const h = 40;

      // Cuerpo del globo
      ctx.fillStyle = "#fdfaf0";
      ctx.fillRect(-w / 2, -h, w, h);

      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 2;
      ctx.strokeRect(-w / 2, -h, w, h);

      // "pico" hacia el gato
      ctx.beginPath();
      const tailDir = cat.direction === 1 ? -1 : 1;
      const tailX =
        tailDir === -1 ? -w / 2 + 14 : w / 2 - 14;
      ctx.moveTo(tailX, -h + 4);
      ctx.lineTo(tailX + 8 * tailDir, -h + 14);
      ctx.lineTo(tailX + 2 * tailDir, -h + 14);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Texto pixel
      ctx.fillStyle = "#333333";
      ctx.font =
        '10px "Press Start 2P", system-ui, sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Te amo", 0, -h / 2 - 1);

      ctx.restore();
    }
  }

  // ------------------------------------------------------
  // Inicialización de objetos
  // ------------------------------------------------------
  const heartSystem = new HeartSystem(mouse, HEART_COLOR);
  const cat = new Cat(heartSystem.getPosition());
  const bubbleManager = new SpeechBubbleManager();

  let lastTime = performance.now();

  // ------------------------------------------------------
  // Bucle principal
  // ------------------------------------------------------
  function loop(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.033); // limitar dt
    lastTime = now;

    // Fondo con rastro corto (fade rápido)
    ctx.fillStyle = "rgba(75,85,150,0.35)";
    ctx.fillRect(0, 0, width, height);

    // Actualizar sistemas
    heartSystem.update(dt, now);
    const heartPos = heartSystem.getPosition();
    cat.update(dt, heartPos.x, heartPos.y);

    // Distancia gato-corazón para activar globo
    const dx = cat.x - heartPos.x;
    const dy = cat.y - heartPos.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 60) {
      bubbleManager.trigger(now);
    }

    bubbleManager.update(now);

    // Dibujar
    heartSystem.draw(ctx);
    cat.draw(ctx);
    bubbleManager.draw(ctx, cat, now);

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
})();


