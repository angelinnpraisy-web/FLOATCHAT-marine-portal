async function initGlobe() {
  const container = document.getElementById('globe-container');
  const loading = document.getElementById('globe-loading');
  const rotationButton = document.getElementById('globe-autorotate');
  const locationLabel = document.getElementById('globe-location');
  const locationName = document.getElementById('globe-location-name');
  const profileButton = document.getElementById('load-depth-profile');

  if (!container) return;

  let THREE;
  let OrbitControls;

  try {
    THREE = await import('three');
    ({ OrbitControls } = await import('three/addons/controls/OrbitControls.js'));
  } catch (error) {
    if (loading) loading.textContent = '3D globe unavailable. Start the page with a local server.';
    console.error('Unable to load the 3D globe library:', error);
    return;
  }

  try {
    const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 3.2);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 2.1;
  controls.maxDistance = 5;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.7;

  scene.add(new THREE.AmbientLight(0x6ba8c7, 1.2));
  const sunLight = new THREE.DirectionalLight(0xffffff, 2.4);
  sunLight.position.set(4, 2, 5);
  scene.add(sunLight);

  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(1, 64, 64),
    new THREE.MeshPhongMaterial({
      map: new THREE.TextureLoader().load(
        'https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg',
        () => {
          if (loading) loading.remove();
        },
        undefined,
        () => {
          if (loading) loading.textContent = 'Earth texture unavailable';
        }
      ),
      specular: new THREE.Color(0x194b66),
      shininess: 18
    })
  );
  scene.add(globe);

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(1.035, 64, 64),
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.12,
      side: THREE.BackSide
    })
  );
  scene.add(atmosphere);

  const stationMarker = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xf97316 })
  );
  stationMarker.visible = false;
  scene.add(stationMarker);
  let selectedLocation = null;

  function resize() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }

  rotationButton?.addEventListener('click', () => {
    controls.autoRotate = !controls.autoRotate;
    rotationButton.textContent = controls.autoRotate ? 'Pause rotation' : 'Auto-rotate';
    rotationButton.setAttribute('aria-pressed', String(controls.autoRotate));
  });

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let pointerDown = null;

  renderer.domElement.addEventListener('pointermove', (event) => {
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(globe)[0];
    if (!hit) return;
    const point = hit.point.clone().normalize();
    const latitude = Math.asin(point.y) * 180 / Math.PI;
    let longitude = Math.atan2(point.z, -point.x) * 180 / Math.PI - 180;
    if (longitude < -180) longitude += 360;
    const label = `${latitude.toFixed(1)}° ${latitude >= 0 ? 'N' : 'S'} / ${Math.abs(longitude).toFixed(1)}° ${longitude >= 0 ? 'E' : 'W'}`;
    if (locationLabel) locationLabel.textContent = label;
    window.dispatchEvent(new CustomEvent('ocean-location-selected', {
      detail: { latitude, longitude, label }
    }));
  });

  renderer.domElement.addEventListener('pointerdown', (event) => {
    pointerDown = { x: event.clientX, y: event.clientY };
  });

  renderer.domElement.addEventListener('pointerup', (event) => {
    if (!pointerDown || Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 6) return;

    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(globe)[0];
    if (!hit) return;

    const point = hit.point.clone().normalize();
    const latitude = Math.asin(point.y) * 180 / Math.PI;
    let longitude = Math.atan2(point.z, -point.x) * 180 / Math.PI - 180;
    if (longitude < -180) longitude += 360;
    selectedLocation = { latitude, longitude };
    stationMarker.position.copy(point.multiplyScalar(1.08));
    stationMarker.visible = true;
    const locationText = `${latitude.toFixed(1)}° ${latitude >= 0 ? 'N' : 'S'} / ${Math.abs(longitude).toFixed(1)}° ${longitude >= 0 ? 'E' : 'W'}`;
    if (locationLabel) locationLabel.textContent = locationText;
    if (locationName) locationName.textContent = '/ RESOLVING LOCATION...';
    window.dispatchEvent(new CustomEvent('ocean-location-selected', {
      detail: { latitude, longitude, label: locationText }
    }));
    resolveOceanLocation(latitude, longitude).then((name) => {
      if (locationName) locationName.textContent = `/ ${name.toUpperCase()}`;
      updateLocationSuggestion(latitude, longitude, name);
      window.dispatchEvent(new CustomEvent('ocean-location-named', { detail: { name } }));
    });
    if (profileButton) profileButton.disabled = false;
    controls.autoRotate = false;
    if (rotationButton) {
      rotationButton.textContent = 'Auto-rotate';
      rotationButton.setAttribute('aria-pressed', 'false');
    }
  });

  profileButton?.addEventListener('click', () => {
    if (!selectedLocation) return;
    window.dispatchEvent(new CustomEvent('depth-profile-requested', { detail: selectedLocation }));
    document.getElementById('depth')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }

    animate();
  } catch (error) {
    if (loading) loading.textContent = 'Unable to start the 3D globe.';
    console.error('Unable to initialize the 3D globe:', error);
  }
}

// Live Telemetry UTC Clock for FloatChat Header
function initTelemetryClock() {
  const clockElement = document.getElementById('utc-clock');
  
  function updateClock() {
    if (!clockElement) return;
    const now = new Date();
    // Format to HH:MM:SS UTC
    const hours = String(now.getUTCHours()).padStart(2, '0');
    const minutes = String(now.getUTCMinutes()).padStart(2, '0');
    const seconds = String(now.getUTCSeconds()).padStart(2, '0');
    
    clockElement.innerText = `${hours}:${minutes}:${seconds} UTC`;
  }

  updateClock();
  setInterval(updateClock, 1000);
}

document.addEventListener('DOMContentLoaded', initTelemetryClock);
document.addEventListener('DOMContentLoaded', initGlobe);

function buildLocationSuggestion(latitude, longitude, regionName = 'selected marine area') {
  const absLat = Math.abs(latitude);
  const isTropical = absLat <= 30;
  const hasFishingPotential = absLat <= 70;

  if (isTropical && hasFishingPotential) {
    return {
      text: `${regionName} sits in a productive reef-and-shelf corridor. This area is a strong candidate for reef stress monitoring and fishing zone review.`,
      coral: true,
      fishing: true
    };
  }

  if (isTropical) {
    return {
      text: `${regionName} is in a reef-heavy tropical band where bleaching and thermal stress are most likely to intensify.`,
      coral: true,
      fishing: false
    };
  }

  if (hasFishingPotential) {
    return {
      text: `${regionName} is a high-activity fishing sector with elevated ecological pressure and possible plankton bloom effects.`,
      coral: false,
      fishing: true
    };
  }

  return {
    text: `${regionName} is an open-ocean sector with limited reef exposure but active pelagic movement patterns worth tracking.`,
    coral: false,
    fishing: true
  };
}

function updateLocationSuggestion(latitude, longitude, regionName = 'selected marine area') {
  const suggestion = document.getElementById('location-suggestion');
  const text = document.getElementById('location-suggestion-text');
  const coralLink = document.getElementById('suggest-coral-link');
  const fishingLink = document.getElementById('suggest-fishing-link');

  if (!suggestion || !text || !coralLink || !fishingLink) return;

  const insight = buildLocationSuggestion(latitude, longitude, regionName);
  const label = `${latitude.toFixed(1)}° ${latitude >= 0 ? 'N' : 'S'} / ${Math.abs(longitude).toFixed(1)}° ${longitude >= 0 ? 'E' : 'W'}`;

  suggestion.hidden = false;
  text.textContent = insight.text;

  coralLink.href = `coral.html?lat=${latitude.toFixed(3)}&lon=${longitude.toFixed(3)}&label=${encodeURIComponent(label)}&name=${encodeURIComponent(regionName)}`;
  fishingLink.href = `fishing.html?lat=${latitude.toFixed(3)}&lon=${longitude.toFixed(3)}&label=${encodeURIComponent(label)}&name=${encodeURIComponent(regionName)}`;

  coralLink.style.display = insight.coral ? 'inline-flex' : 'none';
  fishingLink.style.display = insight.fishing ? 'inline-flex' : 'none';
}

function initChatbot() {
  const chatbot = document.getElementById('slide-leftbar');
  const openButton = document.getElementById('open-chatbot');
  const closeButton = document.getElementById('close-chatbot');
  const input = document.getElementById('chatbot-input');
  const sendButton = document.getElementById('send-chatbot');

  if (!chatbot || !openButton || !closeButton) return;

  openButton.addEventListener('click', (event) => {
    event.preventDefault();
    chatbot.classList.add('is-open');
  });

  closeButton.addEventListener('click', () => {
    chatbot.classList.remove('is-open');
  });

  function sendQuestion() {
    const question = input?.value.trim();
    if (!question) {
      input?.focus();
      return;
    }

    const welcome = chatbot.querySelector('.chatbot-welcome');
    if (welcome) welcome.textContent = `Received: ${question}`;
    input.value = '';
  }

  sendButton?.addEventListener('click', sendQuestion);
  input?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') sendQuestion();
  });
}

document.addEventListener('DOMContentLoaded', initChatbot);

function initDepthProfiler() {
  const slider = document.getElementById('depth-slider');
  const value = document.getElementById('depth-value');
  const temperature = document.getElementById('depth-temperature');
  const pressure = document.getElementById('depth-pressure');
  const refresh = document.getElementById('depth-refresh');
  const exportButton = document.getElementById('depth-export');
  const insightText = document.getElementById('depth-insight-text');
  const confidenceValue = document.getElementById('depth-confidence-value');
  const confidenceBar = document.getElementById('depth-confidence-bar');
  const station = document.getElementById('depth-station');
  const source = document.getElementById('depth-source');
  const locationReadout = document.getElementById('depth-location');
  const locationName = document.getElementById('depth-location-name');
  const container = document.getElementById('depth-container');

  if (!slider || !value || !temperature || !pressure || !container) return;

  let liveProfile = [];

  function updateProfile() {
    const depth = Number(slider.value);
    const nearest = liveProfile.reduce((best, row) => !best || Math.abs(row.depth - depth) < Math.abs(best.depth - depth) ? row : best, null);
    const temperatureValue = nearest ? nearest.temperature : Math.max(1.8, 18.4 - depth * 0.0022);
    const pressureValue = nearest ? Math.round(nearest.pressure / 10) : Math.round(1 + depth * 0.1);
    const confidence = nearest ? 96 : Math.max(82, Math.round(99 - depth / 650));
    const insight = depth < 200
      ? 'Surface layer: high light and active mixing'
      : depth < 1000
        ? 'Thermocline detected: temperature is changing rapidly'
        : depth < 8000
          ? 'Stable deep water: low-light pelagic conditions'
          : 'Abyssal zone: cold, high-pressure conditions';

    value.textContent = depth.toLocaleString();
    temperature.textContent = `${temperatureValue.toFixed(1)} °C`;
    pressure.textContent = `${pressureValue} bar`;
    if (insightText) insightText.textContent = insight;
    if (confidenceValue) confidenceValue.textContent = confidence;
    if (confidenceBar) confidenceBar.style.width = `${confidence}%`;
    container.style.setProperty('--depth-progress', `${(depth / Number(slider.max)) * 100}%`);
  }

  slider.addEventListener('input', updateProfile);
  window.addEventListener('ocean-location-selected', ({ detail }) => {
    if (locationReadout) locationReadout.textContent = `LOCATION / ${detail.label}`;
    if (locationName) locationName.textContent = '/ RESOLVING LOCATION...';
  });
  window.addEventListener('ocean-location-named', ({ detail }) => {
    if (locationName) locationName.textContent = `/ ${detail.name.toUpperCase()}`;
  });
  window.addEventListener('depth-profile-requested', async ({ detail }) => {
    const label = `${detail.latitude.toFixed(1)}° ${detail.latitude >= 0 ? 'N' : 'S'} / ${Math.abs(detail.longitude).toFixed(1)}° ${detail.longitude >= 0 ? 'E' : 'W'}`;
    if (station) station.textContent = `PROFILER / ${label}`;
    if (locationReadout) locationReadout.textContent = `LOCATION / ${label}`;
    if (source) source.textContent = 'LOADING ARGO PROFILE';
    try {
      const profile = await fetchArgoProfile(detail.latitude, detail.longitude);
      liveProfile = profile.depthData.map((depth, index) => ({
        depth,
        pressure: profile.pressureData[index],
        temperature: profile.tempData[index]
      })).filter((row) => Number.isFinite(row.depth) && Number.isFinite(row.pressure) && Number.isFinite(row.temperature));
      if (!liveProfile.length) throw new Error('No profile observations found');
      if (source) source.textContent = `ARGO PROFILE / ${liveProfile.length} OBSERVATIONS`;
      updateProfile();
    } catch (error) {
      liveProfile = [];
      if (source) source.textContent = 'SIMULATED FALLBACK / NO ARGO DATA';
      updateProfile();
      console.warn('Argo profile unavailable for selected station:', error);
    }
  });
  refresh?.addEventListener('click', () => {
    slider.value = String(Math.round((Math.random() * Number(slider.max)) / 50) * 50);
    updateProfile();
    refresh.classList.add('is-refreshing');
    window.setTimeout(() => refresh.classList.remove('is-refreshing'), 500);
  });
  exportButton?.addEventListener('click', () => {
    const depth = Number(slider.value);
    const temperatureValue = Math.max(1.8, 18.4 - depth * 0.0022).toFixed(1);
    const pressureValue = Math.round(1 + depth * 0.1);
    const csv = `station,depth_m,temperature_c,pressure_bar\nStation 04,${depth},${temperatureValue},${pressureValue}\n`;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    link.download = `floatchat-profile-${depth}m.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  });
  updateProfile();
}

document.addEventListener('DOMContentLoaded', initDepthProfiler);

async function fetchArgoProfile(lat, lon) {
  const query = `latitude,longitude,pres,temp,psal&latitude>=${lat - 1}&latitude<=${lat + 1}&longitude>=${lon - 1}&longitude<=${lon + 1}`;
  const url = `https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats.json?${encodeURI(query)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Argo service returned HTTP ${res.status}`);
  const data = await res.json();

  // Extract arrays
  const rows = data.table?.rows || [];
  const pressureData = rows.map(r => Number(r[2])); // pres, decibar
  const depthData = pressureData;
  const tempData  = rows.map(r => Number(r[3])); // temp, degrees Celsius
  const salData   = rows.map(r => Number(r[4])); // psal, PSU

  return { pressureData, depthData, tempData, salData };
}

async function resolveOceanLocation(latitude, longitude) {
  const params = new URLSearchParams({
    format: 'jsonv2',
    lat: latitude.toFixed(5),
    lon: longitude.toFixed(5),
    zoom: '10',
    addressdetails: '1'
  });
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, {
      headers: { 'Accept-Language': 'en' }
    });
    if (!response.ok) throw new Error(`Reverse geocoder returned HTTP ${response.status}`);
    const data = await response.json();
    const address = data.address || {};
    const regionalName = address.island || address.archipelago || address.ocean;
    const stateName = /island|ocean|sea|bay/i.test(address.state || '') ? address.state : null;
    return regionalName || stateName || address.city || address.town || address.village || address.county || data.name || 'OPEN OCEAN';
  } catch (error) {
    console.warn('Unable to resolve ocean location name:', error);
    return 'OPEN OCEAN';
  }
}

async function initAnomalyRadar() {
  const container = document.querySelector('.anomalies-chart');
  const list = document.getElementById('anomalies-list');
  const refreshButton = document.getElementById('anomalies-refresh');
  const exportButton = document.getElementById('anomalies-export');

  if (!container || !list) return;

  let THREE;
  let OrbitControls;
  try {
    THREE = await import('three');
    ({ OrbitControls } = await import('three/addons/controls/OrbitControls.js'));
  } catch (error) {
    container.textContent = 'Anomaly radar unavailable.';
    console.error('Unable to load the anomaly radar library:', error);
    return;
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 4.8);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 3.2;
  controls.maxDistance = 7;

  scene.add(new THREE.AmbientLight(0x7dd3fc, 1.5));
  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(1.65, 32, 32),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8, wireframe: true, transparent: true, opacity: 0.45 })
  );
  scene.add(globe);

  let anomalies = [
    { lat: 30, lon: -40, label: 'North Atlantic', severity: 'HIGH' },
    { lat: -10, lon: 150, label: 'Coral Sea', severity: 'MEDIUM' },
    { lat: 60, lon: 20, label: 'Nordic Basin', severity: 'LOW' }
  ];
  const markerGroup = new THREE.Group();
  scene.add(markerGroup);

  function positionFor(latitude, longitude) {
    const phi = (90 - latitude) * Math.PI / 180;
    const theta = (longitude + 180) * Math.PI / 180;
    return new THREE.Vector3(
      -(1.72 * Math.sin(phi) * Math.cos(theta)),
      1.72 * Math.cos(phi),
      1.72 * Math.sin(phi) * Math.sin(theta)
    );
  }

  function renderList() {
    list.replaceChildren(...anomalies.map((anomaly) => {
      const item = document.createElement('li');
      item.innerHTML = `<span>${anomaly.label} / ${anomaly.lat.toFixed(1)}°, ${anomaly.lon.toFixed(1)}°</span><strong>${anomaly.severity}</strong>`;
      return item;
    }));
  }

  function renderMarkers() {
    markerGroup.clear();
    anomalies.forEach((anomaly, index) => {
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 16, 16),
        new THREE.MeshBasicMaterial({ color: index === 0 ? 0xf97316 : 0xfacc15 })
      );
      marker.position.copy(positionFor(anomaly.lat, anomaly.lon));
      marker.userData.anomalyIndex = index;
      markerGroup.add(marker);
    });
    renderList();
  }

  function resize() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }

  renderMarkers();
  window.addEventListener('ocean-location-selected', ({ detail }) => {
    const stationLabel = document.getElementById('anomalies-station');
    if (stationLabel) stationLabel.textContent = `SELECTED / ${detail.label}`;
  });
  window.addEventListener('ocean-location-named', ({ detail }) => {
    const stationLabel = document.getElementById('anomalies-station');
    if (stationLabel) stationLabel.textContent = `SELECTED / ${detail.name.toUpperCase()}`;
  });
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  renderer.domElement.addEventListener('click', (event) => {
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(markerGroup.children)[0];
    if (!hit) return;
    const anomaly = anomalies[hit.object.userData.anomalyIndex];
    document.getElementById('anomalies-station').textContent = `SELECTED / ${anomaly.label.toUpperCase()}`;
  });

  refreshButton?.addEventListener('click', () => {
    anomalies = anomalies.map((anomaly) => ({
      ...anomaly,
      lat: Math.round((Math.random() * 160 - 80) * 10) / 10,
      lon: Math.round((Math.random() * 360 - 180) * 10) / 10
    }));
    renderMarkers();
  });

  exportButton?.addEventListener('click', () => {
    const csv = `label,latitude,longitude,severity\n${anomalies.map((anomaly) => `${anomaly.label},${anomaly.lat},${anomaly.lon},${anomaly.severity}`).join('\n')}\n`;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    link.download = 'floatchat-anomalies.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  });

  function animate() {
    requestAnimationFrame(animate);
    globe.rotation.y += 0.0015;
    markerGroup.rotation.y = globe.rotation.y;
    controls.update();
    renderer.render(scene, camera);
  }

  animate();
}

document.addEventListener('DOMContentLoaded', initAnomalyRadar);
