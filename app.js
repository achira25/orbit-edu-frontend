
/* ═══════════════════════════════════════════════════════════════════
   ORBIT-EDU — app.js
   Three.js solar system intro + interactive Earth dashboard
   Connects to your Django backend on PythonAnywhere
═══════════════════════════════════════════════════════════════════ */

'use strict';

/* ──────────────────────────────────────────────────────────────────
   ⚙️  CONFIG
   IMPORTANT: Replace this URL with your actual PythonAnywhere URL
   after deployment. Format: https://achira25.pythonanywhere.com
────────────────────────────────────────────────────────────────── */
const API_BASE = 'https://achira25.pythonanywhere.com/api';

/* How often to refresh the ISS position (milliseconds) */
const ISS_REFRESH_INTERVAL = 5000;   // 5 seconds


/* ══════════════════════════════════════════════════════════════════
   PART 1 — SOLAR SYSTEM INTRO SCENE
   Full 3D solar system with all planets orbiting the Sun.
   Camera slowly pans, then zooms into Earth when user clicks Enter.
══════════════════════════════════════════════════════════════════ */

let solarScene, solarCamera, solarRenderer;
let planets = [];       // Array of planet mesh objects
let solarAnimId;        // requestAnimationFrame ID (so we can cancel it)
let loadProgress = 0;

function initSolarSystem() {
  const canvas = document.getElementById('solar-canvas');

  /* ── Three.js Scene ────────────────────────────────────────── */
  solarScene = new THREE.Scene();

  /* ── Camera ─────────────────────────────────────────────────
     PerspectiveCamera(fov, aspectRatio, nearClip, farClip)
     fov = field of view in degrees (75 = normal, wide)
     nearClip/farClip = anything outside this range is invisible */
  solarScene.fog = new THREE.FogExp2(0x000005, 0.012);

  solarCamera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  solarCamera.position.set(0, 18, 35);   // Start above and behind
  solarCamera.lookAt(0, 0, 0);

  /* ── Renderer ───────────────────────────────────────────────
     antialias: smooth edges
     alpha: transparent background so our CSS bg shows */
  solarRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  solarRenderer.setSize(window.innerWidth, window.innerHeight);
  solarRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  /* ── Starfield Background ───────────────────────────────── */
  createStarfield(solarScene, 8000);

  /* ── Sun ─────────────────────────────────────────────────── */
  const sunGeo  = new THREE.SphereGeometry(2.5, 32, 32);
  const sunMat  = new THREE.MeshBasicMaterial({ color: 0xffdd55 });
  const sun     = new THREE.Mesh(sunGeo, sunMat);
  solarScene.add(sun);

  /* Sun glow — a slightly larger, transparent sphere */
  const glowGeo = new THREE.SphereGeometry(3.2, 32, 32);
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xff8800, transparent: true, opacity: 0.15, side: THREE.BackSide
  });
  solarScene.add(new THREE.Mesh(glowGeo, glowMat));

  /* ── Point light from the Sun ───────────────────────────── */
  const sunLight = new THREE.PointLight(0xffeebb, 2.5, 200);
  solarScene.add(sunLight);

  /* Ambient so dark sides of planets aren't totally black */
  solarScene.add(new THREE.AmbientLight(0x111133, 0.8));

  /* ── Planet Data ────────────────────────────────────────────
     Each planet: { name, radius, distance from sun, color,
                    orbitSpeed (radians/frame), tilt, rings? } */
  const planetData = [
    { name:'Mercury', radius:0.22, distance:4.5,  color:0xaaaaaa, speed:0.047, tilt:0 },
    { name:'Venus',   radius:0.55, distance:6.5,  color:0xe8cda0, speed:0.035, tilt:0.05 },
    { name:'Earth',   radius:0.60, distance:9.0,  color:0x3a7de8, speed:0.029, tilt:0.41,
      cloud:true },
    { name:'Mars',    radius:0.35, distance:11.5, color:0xc1440e, speed:0.024, tilt:0.44 },
    { name:'Jupiter', radius:1.20, distance:16.0, color:0xc88b3a, speed:0.013, tilt:0.05 },
    { name:'Saturn',  radius:1.00, distance:21.0, color:0xe4d191, speed:0.009, tilt:0.47,
      rings:true },
    { name:'Uranus',  radius:0.70, distance:26.0, color:0x7de8e8, speed:0.006, tilt:1.71 },
    { name:'Neptune', radius:0.65, distance:30.0, color:0x3f54ba, speed:0.005, tilt:0.49 },
  ];

  /* Build each planet + its orbit ring */
  planetData.forEach((pd, i) => {
    /* Orbit ring (flat torus) */
    const orbitGeo = new THREE.TorusGeometry(pd.distance, 0.015, 2, 128);
    const orbitMat = new THREE.MeshBasicMaterial({
      color: 0x334466, transparent: true, opacity: 0.35
    });
    const orbitMesh = new THREE.Mesh(orbitGeo, orbitMat);
    orbitMesh.rotation.x = Math.PI / 2;
    solarScene.add(orbitMesh);

    /* Planet sphere */
    const geo = new THREE.SphereGeometry(pd.radius, 24, 24);
    const mat = new THREE.MeshStandardMaterial({
      color: pd.color,
      roughness: 0.8,
      metalness: 0.1,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.z = pd.tilt;

    /* Saturn rings */
    if (pd.rings) {
      const ringGeo = new THREE.TorusGeometry(pd.radius * 1.8, pd.radius * 0.4, 2, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xd4b483, transparent: true, opacity: 0.6, side: THREE.DoubleSide
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = 1.2;
      mesh.add(ring);
    }

    /* Starting angle offset so planets don't all start at (distance, 0) */
    const startAngle = (i / planetData.length) * Math.PI * 2;

    planets.push({
      mesh,
      distance: pd.distance,
      speed:    pd.speed,
      angle:    startAngle,
      name:     pd.name,
    });

    /* Set initial position */
    mesh.position.x = Math.cos(startAngle) * pd.distance;
    mesh.position.z = Math.sin(startAngle) * pd.distance;
    solarScene.add(mesh);
  });

  /* ── Animate loading bar ──────────────────────────────────── */
  let loaded = 0;
  const loadInterval = setInterval(() => {
    loaded += 4;
    if (loaded >= 100) {
      loaded = 100;
      clearInterval(loadInterval);
      document.getElementById('loading-text').textContent = 'READY — CLICK ENTER MISSION';
    }
    document.getElementById('loading-bar-fill').style.width = loaded + '%';
    const msgs = [
      'LOADING SOLAR TEXTURES...',
      'CALCULATING ORBITAL PATHS...',
      'SYNCING ISS POSITION...',
      'CALIBRATING 3D ENGINE...',
      'READY — CLICK ENTER MISSION',
    ];
    document.getElementById('loading-text').textContent =
      msgs[Math.floor(loaded / 25)] || msgs[4];
  }, 60);

  /* Start animation loop */
  animateSolar();

  /* Handle window resize */
  window.addEventListener('resize', () => {
    solarCamera.aspect = window.innerWidth / window.innerHeight;
    solarCamera.updateProjectionMatrix();
    solarRenderer.setSize(window.innerWidth, window.innerHeight);
  });
}


/* ── Solar System Animation Loop ─────────────────────────────── */
function animateSolar() {
  solarAnimId = requestAnimationFrame(animateSolar);
  const t = Date.now() * 0.001;   // Time in seconds

  /* Orbit each planet */
  planets.forEach(p => {
    p.angle += p.speed * 0.5;
    p.mesh.position.x = Math.cos(p.angle) * p.distance;
    p.mesh.position.z = Math.sin(p.angle) * p.distance;
    p.mesh.rotation.y += 0.005;   // Self-rotation
  });

  /* Slowly rotate camera around scene for a cinematic effect */
  solarCamera.position.x = Math.sin(t * 0.05) * 38;
  solarCamera.position.z = Math.cos(t * 0.05) * 38;
  solarCamera.position.y = 14 + Math.sin(t * 0.03) * 4;
  solarCamera.lookAt(0, 0, 0);

  solarRenderer.render(solarScene, solarCamera);
}


/* ── Enter Dashboard (transition from solar → Earth) ─────────── */
function enterDashboard() {
  const earthPlanet = planets.find(p => p.name === 'Earth');

  /* GSAP timeline: zoom camera into Earth, then fade screens */
  const tl = gsap.timeline();

  tl.to(solarCamera.position, {
    duration: 2.2,
    x: earthPlanet.mesh.position.x,
    y: earthPlanet.mesh.position.y + 1.5,
    z: earthPlanet.mesh.position.z + 3,
    ease: 'power2.inOut',
    onUpdate: () => solarCamera.lookAt(earthPlanet.mesh.position),
  })
  .to('#screen-intro', {
    duration: 0.8,
    opacity: 0,
    ease: 'power2.in',
  }, '-=0.3')
  .call(() => {
    /* Stop solar animation to free GPU */
    cancelAnimationFrame(solarAnimId);

    /* Show dashboard */
    document.getElementById('screen-intro').classList.add('hidden');
    document.getElementById('screen-dashboard').classList.remove('hidden');

    /* Trigger CSS transition */
    requestAnimationFrame(() => {
      document.getElementById('screen-dashboard').classList.add('visible');
    });

    /* Boot the Earth scene */
    initEarthScene();
  });
}


/* ══════════════════════════════════════════════════════════════════
   PART 2 — EARTH DASHBOARD SCENE
   Interactive 3D Earth with:
   - Realistic day/night shading
   - ISS marker that updates every 5 seconds
   - Orbital trail line
   - Mouse drag to rotate
   - GSAP camera fly-to-ISS
══════════════════════════════════════════════════════════════════ */

let earthScene, earthCamera, earthRenderer;
let earthMesh, issMarker, trailLine;
let earthAnimId;

/* Mouse drag state */
let isDragging = false;
let prevMouseX = 0, prevMouseY = 0;
let rotY = 0, rotX = 0;

/* ISS state */
let issLat = 0, issLon = 0;
let trailPoints = [];   // Array of THREE.Vector3 for the trail

function initEarthScene() {
  const canvas = document.getElementById('earth-canvas');

  /* ── Scene ──────────────────────────────────────────────────── */
  earthScene = new THREE.Scene();

  /* ── Camera ─────────────────────────────────────────────────── */
  earthCamera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  earthCamera.position.set(0, 0, 3.8);

  /* ── Renderer ───────────────────────────────────────────────── */
  earthRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  earthRenderer.setSize(window.innerWidth, window.innerHeight);
  earthRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  /* ── Starfield ──────────────────────────────────────────────── */
  createStarfield(earthScene, 3000);

  /* ── Lighting ───────────────────────────────────────────────── */
  /* Directional light = sunlight from one direction */
  const sunDir = new THREE.DirectionalLight(0xfff5e0, 1.8);
  sunDir.position.set(5, 3, 5);
  earthScene.add(sunDir);

  /* Dim ambient so night side isn't pitch black */
  earthScene.add(new THREE.AmbientLight(0x112244, 0.6));

  /* ── Earth Sphere ───────────────────────────────────────────── */
  const earthGeo = new THREE.SphereGeometry(1, 64, 64);

  /* Use a procedural Earth-like texture since we can't load images
     without a server. Color it ocean-blue with some green landmass feel */
  const earthMat = new THREE.MeshPhongMaterial({
    color:     0x2255aa,   // Deep ocean blue
    emissive:  0x001133,   // Slight glow on night side
    specular:  0x4488ff,   // Specular highlight on water
    shininess: 25,
  });

  earthMesh = new THREE.Mesh(earthGeo, earthMat);
  earthScene.add(earthMesh);

  /* ── Atmosphere glow ─────────────────────────────────────────
     A slightly larger sphere behind the Earth with BackSide rendering
     creates a halo/atmosphere effect */
  const atmGeo = new THREE.SphereGeometry(1.06, 32, 32);
  const atmMat = new THREE.MeshPhongMaterial({
    color:       0x4488ff,
    transparent: true,
    opacity:     0.12,
    side:        THREE.BackSide,
  });
  earthScene.add(new THREE.Mesh(atmGeo, atmMat));

  /* Grid lines overlay */
  const gridHelper = new THREE.Mesh(
    new THREE.SphereGeometry(1.001, 36, 18),
    new THREE.MeshBasicMaterial({
      color:       0x224466,
      wireframe:   true,
      transparent: true,
      opacity:     0.08,
    })
  );
  earthScene.add(gridHelper);

  /* ── ISS Marker ─────────────────────────────────────────────── */
  /* A bright cone pointing outward from Earth surface */
  const issGeo = new THREE.ConeGeometry(0.025, 0.08, 8);
  const issMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
  issMarker = new THREE.Mesh(issGeo, issMat);

  /* Pulsing ring around ISS marker */
  const ringGeo = new THREE.TorusGeometry(0.045, 0.006, 8, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x00ffff, transparent: true, opacity: 0.7
  });
  const issRing = new THREE.Mesh(ringGeo, ringMat);
  issMarker.add(issRing);

  earthScene.add(issMarker);

  /* ── Trail Line ─────────────────────────────────────────────── */
  /* We'll build it once we have data */
  const trailGeo    = new THREE.BufferGeometry();
  const trailMat    = new THREE.LineBasicMaterial({
    color: 0x00d4ff, transparent: true, opacity: 0.5
  });
  trailLine = new THREE.Line(trailGeo, trailMat);
  earthScene.add(trailLine);

  /* ── Mouse drag to rotate Earth ─────────────────────────────── */
  canvas.addEventListener('mousedown', e => { isDragging = true; prevMouseX = e.clientX; prevMouseY = e.clientY; });
  canvas.addEventListener('mouseup',   () => { isDragging = false; });
  canvas.addEventListener('mouseleave',() => { isDragging = false; });
  canvas.addEventListener('mousemove', onMouseMove);

  /* Touch support */
  canvas.addEventListener('touchstart', e => { isDragging = true; prevMouseX = e.touches[0].clientX; prevMouseY = e.touches[0].clientY; });
  canvas.addEventListener('touchend',   () => { isDragging = false; });
  canvas.addEventListener('touchmove',  e => {
    if (!isDragging) return;
    const dx = e.touches[0].clientX - prevMouseX;
    const dy = e.touches[0].clientY - prevMouseY;
    rotY += dx * 0.005;
    rotX += dy * 0.005;
    rotX = Math.max(-1.2, Math.min(1.2, rotX));
    prevMouseX = e.touches[0].clientX;
    prevMouseY = e.touches[0].clientY;
  });

  /* Start animation */
  animateEarth();

  /* Start fetching data */
  fetchISSLocation();
  fetchAPOD();
  fetchAstronauts();
  startClock();

  /* Auto-refresh ISS position */
  setInterval(fetchISSLocation, ISS_REFRESH_INTERVAL);

  /* Resize handler */
  window.addEventListener('resize', () => {
    earthCamera.aspect = window.innerWidth / window.innerHeight;
    earthCamera.updateProjectionMatrix();
    earthRenderer.setSize(window.innerWidth, window.innerHeight);
  });
}


/* ── Mouse drag handler ─────────────────────────────────────── */
function onMouseMove(e) {
  if (!isDragging) {
    /* Show tooltip when hovering near ISS */
    checkISSHover(e);
    return;
  }
  const dx = e.clientX - prevMouseX;
  const dy = e.clientY - prevMouseY;
  rotY += dx * 0.005;
  rotX += dy * 0.005;
  rotX = Math.max(-1.2, Math.min(1.2, rotX));  // Clamp vertical
  prevMouseX = e.clientX;
  prevMouseY = e.clientY;
}


/* ── Earth Animation Loop ───────────────────────────────────── */
function animateEarth() {
  earthAnimId = requestAnimationFrame(animateEarth);
  const t = Date.now() * 0.001;

  /* Auto-rotate slowly when not dragging */
  if (!isDragging) {
    rotY += 0.0015;
  }

  /* Apply rotation */
  earthMesh.rotation.y = rotY;
  earthMesh.rotation.x = rotX;

  /* ISS marker pulses in size */
  const pulse = 1 + 0.15 * Math.sin(t * 4);
  if (issMarker) {
    issMarker.scale.set(pulse, pulse, pulse);
    /* Keep marker on Earth surface (rotate with Earth) */
    issMarker.rotation.y = rotY;
    issMarker.rotation.x = rotX;
  }

  earthRenderer.render(earthScene, earthCamera);
}


/* ── Convert lat/lon to 3D point on sphere ──────────────────── */
function latLonToVec3(lat, lon, radius = 1.02) {
  /*
    Earth is a sphere. To place a point at lat/lon:
    - Convert degrees to radians
    - Use spherical coordinates:
        x = r * cos(lat) * cos(lon)
        y = r * sin(lat)
        z = r * cos(lat) * sin(lon)
  */
  const phi   = (90 - lat)  * (Math.PI / 180);   // Polar angle from North
  const theta = (lon + 180) * (Math.PI / 180);   // Azimuthal angle
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
     radius * Math.cos(phi),
     radius * Math.sin(phi) * Math.sin(theta)
  );
}


/* ── Place ISS marker on Earth surface ──────────────────────── */
function updateISSMarker(lat, lon) {
  if (!issMarker) return;

  const pos = latLonToVec3(lat, lon, 1.08);   // Slightly above surface
  issMarker.position.copy(pos);

  /* Orient the cone to point away from Earth center */
  issMarker.lookAt(pos.clone().multiplyScalar(2));
}


/* ── Update orbital trail line ──────────────────────────────── */
function updateTrail(positions) {
  /* positions = array of { latitude, longitude } from Django history API */
  trailPoints = positions.map(p =>
    latLonToVec3(parseFloat(p.latitude), parseFloat(p.longitude), 1.05)
  );

  if (trailPoints.length < 2) return;

  const posArray = [];
  trailPoints.forEach(v => posArray.push(v.x, v.y, v.z));

  trailLine.geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(posArray, 3)
  );
  trailLine.geometry.computeBoundingSphere();
}


/* ── Hover detection near ISS ───────────────────────────────── */
function checkISSHover(e) {
  /* Project ISS marker world position to screen coordinates */
  if (!issMarker) return;

  const screenPos = issMarker.position.clone().project(earthCamera);
  const sx = ( screenPos.x + 1) / 2 * window.innerWidth;
  const sy = (-screenPos.y + 1) / 2 * window.innerHeight;

  const dist = Math.hypot(e.clientX - sx, e.clientY - sy);
  const tooltip = document.getElementById('earth-tooltip');

  if (dist < 40) {
    document.getElementById('tooltip-coords').textContent =
      `LAT ${issLat.toFixed(2)}°  LON ${issLon.toFixed(2)}°`;
    tooltip.classList.add('visible');
  } else {
    tooltip.classList.remove('visible');
  }
}


/* ── Camera fly to ISS ───────────────────────────────────────── */
function flyToISS() {
  /* Calculate where Earth surface is at ISS position */
  const target = latLonToVec3(issLat, issLon, 3.2);

  gsap.to(earthCamera.position, {
    duration: 1.8,
    x: target.x,
    y: target.y,
    z: target.z,
    ease: 'power2.inOut',
    onUpdate: () => earthCamera.lookAt(0, 0, 0),
  });
}

function resetCamera() {
  gsap.to(earthCamera.position, {
    duration: 1.5,
    x: 0, y: 0, z: 3.8,
    ease: 'power2.inOut',
    onUpdate: () => earthCamera.lookAt(0, 0, 0),
  });
}


/* ══════════════════════════════════════════════════════════════════
   PART 3 — API CALLS TO DJANGO BACKEND
   All data is fetched from your PythonAnywhere Django API.
══════════════════════════════════════════════════════════════════ */

/* ── Fetch Live ISS Location ─────────────────────────────────── */
async function fetchISSLocation() {
  try {
    const res  = await fetch(`${API_BASE}/iss/location/`);
    const json = await res.json();

    if (!json.success) throw new Error(json.error || 'API error');

    const d = json.data;
    issLat = parseFloat(d.latitude);
    issLon = parseFloat(d.longitude);

    /* Update 3D marker */
    updateISSMarker(issLat, issLon);

    /* Update left panel UI */
    document.getElementById('iss-lat').textContent = issLat.toFixed(4) + '°';
    document.getElementById('iss-lon').textContent = issLon.toFixed(4) + '°';
    document.getElementById('iss-alt').textContent = parseFloat(d.altitude).toFixed(1) + ' km';
    document.getElementById('iss-vel').textContent = parseFloat(d.velocity).toFixed(2) + ' km/s';
    document.getElementById('iss-vis').textContent = (d.visibility || '—').toUpperCase();

    const statusEl = document.getElementById('iss-status');
    statusEl.textContent = json.source === 'live' ? 'LIVE ●' : 'CACHED';
    statusEl.className   = 'data-value ' + (json.source === 'live' ? 'status-ok' : '');

    /* Update last update time */
    document.getElementById('last-update').textContent =
      'Last update: ' + new Date().toLocaleTimeString();

    /* Fetch trail history */
    fetchISSHistory();

  } catch (err) {
    console.error('ISS fetch error:', err);
    document.getElementById('iss-status').textContent = 'ERROR';
    document.getElementById('iss-status').className = 'data-value status-err';
  }
}


/* ── Fetch ISS History Trail ─────────────────────────────────── */
async function fetchISSHistory() {
  try {
    const res  = await fetch(`${API_BASE}/iss/history/?limit=50`);
    const json = await res.json();
    if (json.success && json.data.length > 1) {
      updateTrail(json.data);
    }
  } catch (err) {
    console.warn('Trail fetch error:', err);
  }
}


/* ── Fetch NASA APOD ─────────────────────────────────────────── */
async function fetchAPOD() {
  const loadEl = document.getElementById('apod-loading');
  try {
    const res  = await fetch(`${API_BASE}/apod/`);
    const json = await res.json();

    loadEl.style.display = 'none';

    if (!json.success) throw new Error(json.error);

    const d = json.data;

    /* Show image */
    if (d.media_type === 'image') {
      const img = document.getElementById('apod-img');
      img.src = d.url;
      img.style.display = 'block';
      img.onload = () => img.style.display = 'block';
    }

    document.getElementById('apod-title').textContent       = d.title;
    document.getElementById('apod-date').textContent        = '📅 ' + d.date;
    document.getElementById('apod-explanation').textContent =
      d.explanation.length > 400
        ? d.explanation.substring(0, 400) + '...'
        : d.explanation;
    document.getElementById('apod-copyright').textContent =
      d.copyright ? '© ' + d.copyright : '';

  } catch (err) {
    loadEl.textContent = 'COULD NOT LOAD NASA APOD';
    console.error('APOD error:', err);
  }
}


/* ── Fetch Astronauts in Space ───────────────────────────────── */
async function fetchAstronauts() {
  const loadEl  = document.getElementById('crew-loading');
  const listEl  = document.getElementById('crew-list');

  try {
    const res  = await fetch(`${API_BASE}/astronauts/`);
    const json = await res.json();

    loadEl.style.display = 'none';

    if (!json.success) throw new Error(json.error);

    const emojis = ['👨‍🚀','👩‍🚀','🧑‍🚀'];
    listEl.innerHTML = json.people.map((p, i) => `
      <div class="crew-item">
        <div class="crew-avatar">${emojis[i % 3]}</div>
        <div>
          <div class="crew-name">${p.name}</div>
          <div class="crew-craft">${p.craft}</div>
        </div>
      </div>
    `).join('');

    /* Update the crew count in nav */
    const crewNav = document.querySelector('[onclick="showPanel(\'crew\')"]');
    if (crewNav) crewNav.textContent = `CREW (${json.number})`;

  } catch (err) {
    loadEl.textContent = 'COULD NOT LOAD CREW DATA';
    console.error('Crew error:', err);
  }
}


/* ── Fetch ISS Pass Predictions ──────────────────────────────── */
async function fetchPasses() {
  const lat     = parseFloat(document.getElementById('pass-lat').value);
  const lon     = parseFloat(document.getElementById('pass-lon').value);
  const loadEl  = document.getElementById('passes-loading');
  const listEl  = document.getElementById('passes-list');

  if (isNaN(lat) || isNaN(lon)) {
    listEl.innerHTML = '<p style="color:var(--danger);font-size:0.75rem">Please enter valid coordinates.</p>';
    return;
  }

  loadEl.style.display = 'block';
  listEl.innerHTML = '';

  try {
    const res  = await fetch(`${API_BASE}/passes/?lat=${lat}&lon=${lon}`);
    const json = await res.json();

    loadEl.style.display = 'none';

    if (!json.success) throw new Error(json.error);

    if (json.passes.length === 0) {
      listEl.innerHTML = '<p style="color:var(--muted);font-size:0.75rem">No passes found.</p>';
      return;
    }

    listEl.innerHTML = json.passes.map((p, i) => {
      const dt = new Date(p.rise_time);
      return `
        <div class="pass-item">
          <div class="pass-time">PASS ${i+1} — ${dt.toUTCString().slice(0, 22)}</div>
          <div class="pass-duration">⏱ ${p.duration_minutes} min visible</div>
        </div>
      `;
    }).join('');

  } catch (err) {
    loadEl.style.display = 'none';
    listEl.innerHTML = '<p style="color:var(--danger);font-size:0.75rem">Error fetching passes. Try again.</p>';
    console.error('Passes error:', err);
  }
}


/* ══════════════════════════════════════════════════════════════════
   PART 4 — UI HELPERS
══════════════════════════════════════════════════════════════════ */

/* ── Switch between right-panel sub-panels ─────────────────── */
function showPanel(name) {
  /* Update nav active state */
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  event.target.classList.add('active');

  /* Show the right sub-panel */
  document.querySelectorAll('.sub-panel').forEach(el => el.classList.remove('active'));
  document.getElementById('sub-' + name).classList.add('active');
}


/* ── UTC Clock ──────────────────────────────────────────────── */
function startClock() {
  function tick() {
    const now = new Date();
    const h   = String(now.getUTCHours()).padStart(2,'0');
    const m   = String(now.getUTCMinutes()).padStart(2,'0');
    const s   = String(now.getUTCSeconds()).padStart(2,'0');
    document.getElementById('utc-clock').textContent = `UTC ${h}:${m}:${s}`;
  }
  tick();
  setInterval(tick, 1000);
}


/* ══════════════════════════════════════════════════════════════════
   PART 5 — SHARED HELPERS
══════════════════════════════════════════════════════════════════ */

/* ── Create a starfield for any Three.js scene ──────────────── */
function createStarfield(scene, count = 6000) {
  /*
    We create 'count' random points in 3D space.
    Each point is a star.
    BufferGeometry is the most efficient way to draw thousands of points.
  */
  const positions = new Float32Array(count * 3);  // x,y,z per star
  const colors    = new Float32Array(count * 3);  // r,g,b per star

  for (let i = 0; i < count; i++) {
    /* Random position on a large sphere */
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    const r     = 80 + Math.random() * 400;

    positions[i*3]   = r * Math.sin(phi) * Math.cos(theta);
    positions[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i*3+2] = r * Math.cos(phi);

    /* Stars range from cool white-blue to warm yellow-white */
    const warmth = Math.random();
    colors[i*3]   = 0.8 + warmth * 0.2;   // R
    colors[i*3+1] = 0.8 + warmth * 0.15;  // G
    colors[i*3+2] = 1.0 - warmth * 0.3;   // B
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color',    new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.PointsMaterial({
    size:         0.25,
    vertexColors: true,   // Use per-star colors we set above
    transparent:  true,
    opacity:      0.9,
  });

  scene.add(new THREE.Points(geo, mat));
}


/* ══════════════════════════════════════════════════════════════════
   BOOT — Run when page loads
══════════════════════════════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', () => {
  initSolarSystem();
});
