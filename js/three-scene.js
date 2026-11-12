// ============================================================
// CleanCam – 3D WebGL Scroll Animation Engine
// Procedural Three.js 3D Globe, IoT DrainageGuard Node &
// Scroll-driven trajectory and interactive particle system.
// ============================================================

(function() {
  let scene, camera, renderer;
  let globeGroup, deviceGroup, particleGroup, waterStream;
  let width, height;
  let scrollProgress = 0;
  let targetCameraPos = { x: 0, y: 0, z: 24 };
  let targetRotation = { x: 0, y: 0 };
  let mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };
  let animId = null;

  function initThree() {
    const canvas = document.getElementById('hero-canvas');
    if (!canvas || typeof THREE === 'undefined') return;

    width = canvas.clientWidth || window.innerWidth * 0.55;
    height = canvas.clientHeight || window.innerHeight;

    // 1. Scene, Camera, Renderer
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 0, 24);

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // 2. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0x22c55e, 1.8);
    dirLight1.position.set(15, 20, 15);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x38bdf8, 1.2);
    dirLight2.position.set(-15, -10, -10);
    scene.add(dirLight2);

    // 3. Build 3D Holographic Cameroon Globe
    globeGroup = new THREE.Group();
    scene.add(globeGroup);

    // Core sphere with wireframe
    const sphereGeo = new THREE.SphereGeometry(6, 32, 32);
    const sphereMat = new THREE.MeshBasicMaterial({
      color: 0x15803d,
      wireframe: true,
      transparent: true,
      opacity: 0.18
    });
    const coreSphere = new THREE.Mesh(sphereGeo, sphereMat);
    globeGroup.add(coreSphere);

    // Atmospheric inner glowing sphere
    const innerGeo = new THREE.SphereGeometry(5.85, 24, 24);
    const innerMat = new THREE.MeshPhongMaterial({
      color: 0x052e16,
      emissive: 0x14532d,
      specular: 0x22c55e,
      shininess: 40,
      transparent: true,
      opacity: 0.45
    });
    globeGroup.add(new THREE.Mesh(innerGeo, innerMat));

    // Orbital latitude & equator rings
    const ringGeo1 = new THREE.RingGeometry(6.6, 6.75, 48);
    const ringMat1 = new THREE.MeshBasicMaterial({ color: 0x22c55e, side: THREE.DoubleSide, transparent: true, opacity: 0.4 });
    const ring1 = new THREE.Mesh(ringGeo1, ringMat1);
    ring1.rotation.x = Math.PI / 2.3;
    globeGroup.add(ring1);

    const ring2 = ring1.clone();
    ring2.rotation.y = Math.PI / 3;
    ring2.rotation.x = Math.PI / 4;
    globeGroup.add(ring2);

    // Cameroon Beacons (Douala: ~4°N, 9.7°E, Yaoundé: ~3.8°N, 11.5°E)
    function addBeacon(lat, lng, colorHex, label) {
      const phi = (90 - lat) * (Math.PI / 180);
      const theta = (lng + 180) * (Math.PI / 180);
      const r = 6.05;
      const x = -(r * Math.sin(phi) * Math.cos(theta));
      const z = (r * Math.sin(phi) * Math.sin(theta));
      const y = (r * Math.cos(phi));

      // Pin base
      const pinGeo = new THREE.SphereGeometry(0.24, 12, 12);
      const pinMat = new THREE.MeshBasicMaterial({ color: colorHex });
      const pin = new THREE.Mesh(pinGeo, pinMat);
      pin.position.set(x, y, z);
      globeGroup.add(pin);

      // Radar pulse ring
      const pulseGeo = new THREE.RingGeometry(0.1, 0.45, 16);
      const pulseMat = new THREE.MeshBasicMaterial({ color: colorHex, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
      const pulseRing = new THREE.Mesh(pulseGeo, pulseMat);
      pulseRing.position.set(x, y, z);
      pulseRing.lookAt(0, 0, 0);
      globeGroup.add(pulseRing);

      return { pin, pulseRing };
    }

    const beaconDouala = addBeacon(4.05, 9.77, 0xef4444, 'Douala');
    const beaconYde = addBeacon(3.87, 11.51, 0xf97316, 'Yaoundé');

    // 4. Build 3D IoT DrainageGuard Device Model
    deviceGroup = new THREE.Group();
    deviceGroup.position.set(10, -5, 0); // Positioned off to the side initially
    scene.add(deviceGroup);

    // IP65 Weatherproof Enclosure Body
    const boxGeo = new THREE.BoxGeometry(3.6, 4.4, 1.8);
    const boxMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.35,
      metalness: 0.65
    });
    const deviceBox = new THREE.Mesh(boxGeo, boxMat);
    deviceGroup.add(deviceBox);

    // Solar Panel on top
    const solarGeo = new THREE.BoxGeometry(3.2, 0.15, 1.5);
    const solarMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      emissive: 0x1e3a8a,
      roughness: 0.1,
      metalness: 0.9
    });
    const solarPanel = new THREE.Mesh(solarGeo, solarMat);
    solarPanel.position.set(0, 2.3, 0);
    solarPanel.rotation.x = -0.2;
    deviceGroup.add(solarPanel);

    // Dual Ultrasonic Transducers (Drainage water-level sensors)
    const coneGeo = new THREE.CylinderGeometry(0.35, 0.55, 0.8, 16);
    const coneMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8, roughness: 0.2 });
    const trans1 = new THREE.Mesh(coneGeo, coneMat);
    trans1.position.set(-0.85, -2.4, 0);
    deviceGroup.add(trans1);

    const trans2 = trans1.clone();
    trans2.position.set(0.85, -2.4, 0);
    deviceGroup.add(trans2);

    // Ultrasonic acoustic beam pulses (water level detection)
    const beamGeo = new THREE.ConeGeometry(1.2, 3.5, 16, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
      wireframe: true,
      transparent: true,
      opacity: 0.35
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(0, -4.2, 0);
    beam.rotation.x = Math.PI;
    deviceGroup.add(beam);

    // Glowing LED indicators
    const ledGeo = new THREE.SphereGeometry(0.12, 10, 10);
    const ledGreen = new THREE.Mesh(ledGeo, new THREE.MeshBasicMaterial({ color: 0x22c55e }));
    ledGreen.position.set(-1.0, 1.4, 0.95);
    deviceGroup.add(ledGreen);

    const ledOrange = new THREE.Mesh(ledGeo, new THREE.MeshBasicMaterial({ color: 0xf97316 }));
    ledOrange.position.set(-0.6, 1.4, 0.95);
    deviceGroup.add(ledOrange);

    // GSM Antenna
    const antGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.8, 8);
    const antMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.8 });
    const antenna = new THREE.Mesh(antGeo, antMat);
    antenna.position.set(1.4, 2.6, 0);
    deviceGroup.add(antenna);

    // 5. Environmental Floating Particles (Particulates + Water Droplets)
    particleGroup = new THREE.Group();
    scene.add(particleGroup);

    const P_COUNT = 320;
    const partGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(P_COUNT * 3);
    const colors = new Float32Array(P_COUNT * 3);

    const greenColor = new THREE.Color(0x22c55e);
    const blueColor = new THREE.Color(0x0ea5e9);
    const smogColor = new THREE.Color(0xf59e0b);

    for (let i = 0; i < P_COUNT; i++) {
      const idx = i * 3;
      positions[idx] = (Math.random() - 0.5) * 32;
      positions[idx + 1] = (Math.random() - 0.5) * 32;
      positions[idx + 2] = (Math.random() - 0.5) * 20;

      const c = Math.random() > 0.4 ? greenColor : (Math.random() > 0.5 ? blueColor : smogColor);
      colors[idx] = c.r;
      colors[idx + 1] = c.g;
      colors[idx + 2] = c.b;
    }

    partGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    partGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const partMat = new THREE.PointsMaterial({
      size: 0.28,
      vertexColors: true,
      transparent: true,
      opacity: 0.75
    });

    const particles = new THREE.Points(partGeo, partMat);
    particleGroup.add(particles);

    // 6. Mouse movement parallax
    window.addEventListener('mousemove', e => {
      mouse.targetX = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.targetY = -(e.clientY / window.innerHeight) * 2 + 1;
    });

    // 7. Scroll listener for 3D Camera Path
    function onScroll() {
      const totalScroll = document.documentElement.scrollHeight - window.innerHeight;
      scrollProgress = totalScroll > 0 ? Math.min(1, Math.max(0, window.scrollY / totalScroll)) : 0;

      // Dynamic 3D Camera Trajectory:
      // 0.00 - 0.20: Focus on Globe
      // 0.20 - 0.50: Pan & Zoom into IoT DrainageGuard Device
      // 0.50 - 0.80: Zoom out to show clean particles & water network
      // 0.80 - 1.00: High-altitude connected satellite perspective
      if (scrollProgress < 0.25) {
        const t = scrollProgress / 0.25;
        targetCameraPos.x = 2 * (1 - t);
        targetCameraPos.y = -t * 1.5;
        targetCameraPos.z = 24 - t * 4;
        globeGroup.position.set(0, 0, 0);
        deviceGroup.position.set(12 - t * 6, -6 + t * 4, -4);
        globeGroup.scale.set(1, 1, 1);
      } else if (scrollProgress < 0.65) {
        const t = (scrollProgress - 0.25) / 0.4;
        targetCameraPos.x = 4 + t * 2;
        targetCameraPos.y = 1 - t * 3;
        targetCameraPos.z = 18 - t * 2;
        // Bring DrainageGuard device center-stage
        deviceGroup.position.set(3 - t * 2, 0, 4);
        deviceGroup.rotation.y = 0.5 + t * 1.8;
        deviceGroup.rotation.x = 0.2 + t * 0.4;
        globeGroup.position.set(-8 - t * 8, 2, -10);
      } else {
        const t = (scrollProgress - 0.65) / 0.35;
        targetCameraPos.x = 0;
        targetCameraPos.y = -2 + t * 4;
        targetCameraPos.z = 22 + t * 6;
        globeGroup.position.set(0, 0, 0);
        globeGroup.scale.set(1 + t * 0.4, 1 + t * 0.4, 1 + t * 0.4);
        deviceGroup.position.set(8, -8, -6);
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // 8. Resize Handler
    window.addEventListener('resize', () => {
      width = canvas.clientWidth || window.innerWidth * 0.55;
      height = canvas.clientHeight || window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    });

    // 9. Animation Loop
    let clock = new THREE.Clock();
    function animate() {
      animId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      // Smooth mouse lerp
      mouse.x += (mouse.targetX - mouse.x) * 0.05;
      mouse.y += (mouse.targetY - mouse.y) * 0.05;

      // Smooth camera position lerp
      camera.position.x += (targetCameraPos.x + mouse.x * 2.5 - camera.position.x) * 0.05;
      camera.position.y += (targetCameraPos.y + mouse.y * 2.0 - camera.position.y) * 0.05;
      camera.position.z += (targetCameraPos.z - camera.position.z) * 0.05;
      camera.lookAt(0, 0, 0);

      // Globe rotation
      globeGroup.rotation.y = elapsed * 0.15;
      globeGroup.rotation.x = Math.sin(elapsed * 0.08) * 0.12;

      // Beacon pulses
      if (beaconDouala && beaconDouala.pulseRing) {
        const scale = 1 + (Math.sin(elapsed * 4) + 1) * 0.6;
        beaconDouala.pulseRing.scale.set(scale, scale, scale);
      }
      if (beaconYde && beaconYde.pulseRing) {
        const scale = 1 + (Math.sin(elapsed * 4 + 1.5) + 1) * 0.6;
        beaconYde.pulseRing.scale.set(scale, scale, scale);
      }

      // Device gentle floating & antenna wave animation
      deviceGroup.position.y += Math.sin(elapsed * 1.5) * 0.005;
      beam.scale.y = 1 + Math.sin(elapsed * 5) * 0.15;

      // Particle slow drift
      particleGroup.rotation.y = elapsed * 0.04;
      particleGroup.rotation.x = Math.sin(elapsed * 0.03) * 0.05;

      renderer.render(scene, camera);
    }

    animate();
  }

  // Auto initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initThree);
  } else {
    initThree();
  }

  window.initThree3DScene = initThree;
})();
