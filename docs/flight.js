const destinations = [
  ['Reykjavík', 'Iceland', -21.94, 64.15, 'The steam comes out of the ground here. Should I call a mechanic?'],
  ['Lisbon', 'Portugal', -9.14, 38.72, 'I ordered one custard tart. My cargo bay is full.'],
  ['Marrakesh', 'Morocco', -8.0, 31.63, 'Bought a tiny rug. It is now my emergency landing mat.'],
  ['Tromsø', 'Norway', 18.96, 69.65, 'The sky is green. I checked my wiring twice.'],
  ['Dakar', 'Senegal', -17.45, 14.69, 'Put a sticker on the jetpack. It’s practically luggage now.'],
  ['Cape Town', 'South Africa', 18.42, -33.93, 'Finally, a table big enough for the maintenance manual.'],
  ['Nairobi', 'Kenya', 36.82, -1.29, 'Tried blending in with a herd. They noticed the jetpack.'],
  ['Cairo', 'Egypt', 31.24, 30.04, 'The pyramids have great corners. Big fan.'],
  ['Tbilisi', 'Georgia', 44.79, 41.72, 'A cable car! I could have left the jetpack at home.'],
  ['Jaipur', 'India', 75.79, 26.91, 'I blended in right up until the jetpack went off.'],
  ['Kathmandu', 'Nepal', 85.32, 27.71, 'Adjusted my altitude settings from “up” to “more up.”'],
  ['Singapore', 'Singapore', 103.82, 1.35, 'The gardens have giant metal trees. I feel very welcome.'],
  ['Kyoto', 'Japan', 135.77, 35.01, 'Turned on quiet mode. The jetpack has filed an objection.'],
  ['Perth', 'Australia', 115.86, -31.95, 'I have sand in places that were factory sealed.'],
  ['Wellington', 'New Zealand', 174.78, -41.29, 'That landing was three separate landings in a trench coat.'],
  ['Papeete', 'French Polynesia', -149.57, -17.54, 'I would like to remain here for maintenance purposes.'],
  ['Honolulu', 'Hawaiʻi, United States', -157.86, 21.31, 'The jetpack is off. That sizzling is me.'],
  ['Vancouver', 'Canada', -123.12, 49.28, 'Weatherproofing passed. Sockproofing failed.'],
  ['Mexico City', 'Mexico', -99.13, 19.43, 'I can’t eat tacos. I have gathered several for research.'],
  ['Chicago', 'United States', -87.63, 41.88, 'I now understand what they meant by “windy.”'],
  ['Medellín', 'Colombia', -75.58, 6.25, 'The coffee smells fantastic. I poured it into the wrong port.'],
  ['Cusco', 'Peru', -71.97, -13.52, 'Thin air. Thick maintenance report.'],
  ['La Paz', 'Bolivia', -68.12, -16.49, 'Asked for a ground-floor room. Ground is a relative term here.'],
  ['Ushuaia', 'Argentina', -68.30, -54.80, 'Reached the end of the road. Good thing I brought a rocket.'],
  ['Recife', 'Brazil', -34.88, -8.05, 'I learned to dance. The jetpack learned something else.'],
].map(([name, region, longitude, latitude, quip]) => ({ name, region, point: [longitude, latitude], quip }));

const flightQuips = [
  '“I read the first page of the manual.”',
  '“Good news. The other button also says GO.”',
  '“I’ve got enough fuel if you round up.”',
  '“Was that a cloud or a very patient sheep?”',
  '“I can explain the noise or I can steer.”',
];

const ui = Object.fromEntries([
  'viewport', 'globe', 'follow', 'map-message', 'coordinates', 'status', 'origin',
  'destination', 'region', 'progress', 'quip', 'pause', 'skip', 'landings',
].map(id => [id, document.getElementById(id)]));

const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
const plane = ui.globe.getContext('2d');
const sprite = document.querySelector('.pilot img');
const projection = d3.geoOrthographic().precision(0.55);
const path = d3.geoPath(projection, plane);
const graticule = d3.geoGraticule().step([15, 15])();
const stars = Array.from({ length: 140 }, (_, index) => ({
  x: ((index * 233) % 991) / 991,
  y: ((index * index * 127 + 57) % 983) / 983,
  radius: index % 19 === 0 ? 1.15 : 0.45,
  opacity: 0.10 + (index % 7) * 0.06,
}));

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const wrapLongitude = longitude => ((longitude + 180) % 360 + 360) % 360 - 180;
const easeInOut = value => value * value * (3 - 2 * value);
const START = destinations[0];
const LANDING_MS = 4400;
const REVERSING_QUIP = '“Overshot. Reversing with dignity.”';
const view = { width: 0, height: 0, radius: 0, scale: 1, center: [-5, 41], following: true };
const trip = { visited: [START], paused: motionPreference.matches };
let land;
let cameraDrag;
let frame = null;
let lastTime = null;

function launch(from, point = from.point) {
  const candidates = destinations.filter(place =>
    place !== trip.to && !trip.visited.slice(0, 4).includes(place) && d3.geoDistance(point, place.point) > 0.18,
  );
  const to = candidates[Math.floor(Math.random() * candidates.length)];
  const interpolate = d3.geoInterpolate(point, to.point);
  const route = Array.from({ length: 49 }, (_, index) => interpolate(index / 48));

  Object.assign(trip, {
    from, to, interpolate, route, elapsed: 0, landed: false, point,
    duration: 7300 + interpolate.distance * 2400,
    overshoot: Math.min(0.13, 0.054 / interpolate.distance),
    quip: flightQuips[Math.floor(Math.random() * flightQuips.length)],
    reversing: false,
  });
  updateTracker();
}

function arrive() {
  trip.landed = true;
  trip.point = trip.to.point;
  trip.elapsed = 0;
  trip.visited.unshift(trip.to);
  trip.visited.length = Math.min(trip.visited.length, 5);
  updateTracker();
  updateLog();
}

function updateTracker() {
  ui.status.textContent = trip.paused ? 'Paused' : trip.landed ? 'Landed' : 'In flight';
  ui.status.dataset.paused = String(trip.paused);
  ui.pause.innerHTML = trip.paused ? '<span aria-hidden="true">▶</span> Resume' : '<span aria-hidden="true">Ⅱ</span> Pause';
  ui.origin.textContent = trip.landed ? 'Arrived at' : trip.from ? `From ${trip.from.name} →` : 'Rerouting mid-flight →';
  ui.destination.textContent = trip.to.name;
  ui.region.textContent = trip.to.region;
  ui.quip.textContent = trip.landed ? `“${trip.to.quip}”` : trip.reversing ? REVERSING_QUIP : trip.quip;
  ui.progress.value = trip.landed ? 1 : trip.elapsed / trip.duration;
}

function updateLog() {
  ui.landings.replaceChildren(...trip.visited.slice(0, 3).map(place => {
    const item = document.createElement('li');
    const region = document.createElement('span');
    item.textContent = place.name;
    region.textContent = place.region;
    item.append(region);
    return item;
  }));
}

function advance(milliseconds) {
  trip.elapsed += milliseconds;
  if (trip.landed) {
    if (trip.elapsed >= LANDING_MS) launch(trip.to);
    return;
  }
  const progress = trip.elapsed / trip.duration;
  if (progress >= 1) {
    arrive();
    return;
  }
  if (progress > 0.86 && !trip.reversing && !motionPreference.matches) {
    trip.reversing = true;
    ui.quip.textContent = REVERSING_QUIP;
  }
  const flightPosition = motionPreference.matches ? progress : progress < 0.86
    ? easeInOut(progress / 0.86) * (1 + trip.overshoot)
    : 1 + trip.overshoot * (1 - easeInOut((progress - 0.86) / 0.14));
  trip.point = trip.interpolate(flightPosition);
  ui.progress.value = progress;
}

function resize() {
  const { width, height } = ui.viewport.getBoundingClientRect();
  view.scale = Math.min(devicePixelRatio || 1, 2);
  view.width = width;
  view.height = height;
  view.radius = Math.min(width * 0.405, height * 0.438);
  ui.globe.width = Math.round(width * view.scale);
  ui.globe.height = Math.round(height * view.scale);
  plane.setTransform(view.scale, 0, 0, view.scale, 0, 0);
  projection.translate([width / 2, height / 2 + 6]).scale(view.radius);
  requestDraw();
}

function drawPath(geometry, stroke, width = 1) {
  plane.beginPath();
  path(geometry);
  plane.strokeStyle = stroke;
  plane.lineWidth = width;
  plane.stroke();
}

function spot(x, y, radius, color) {
  plane.beginPath();
  plane.arc(x, y, radius, 0, 2 * Math.PI);
  plane.fillStyle = color;
  plane.fill();
}

function drawGlobe() {
  const [x, y] = projection.translate();
  const radius = view.radius;
  plane.clearRect(0, 0, view.width, view.height);
  for (const star of stars) spot(star.x * view.width, star.y * view.height, star.radius, `rgba(184,217,255,${star.opacity})`);

  const halo = plane.createRadialGradient(x, y, radius * 0.91, x, y, radius * 1.14);
  halo.addColorStop(0, '#3782b000');
  halo.addColorStop(0.45, '#3782b04f');
  halo.addColorStop(1, '#3782b000');
  spot(x, y, radius * 1.14, halo);

  projection.rotate([-view.center[0], -view.center[1], 0]);
  const ocean = plane.createLinearGradient(x - radius, y - radius, x + radius, y + radius);
  ocean.addColorStop(0, '#123958');
  ocean.addColorStop(0.54, '#102d49');
  ocean.addColorStop(1, '#0b1d34');
  spot(x, y, radius, ocean);
  drawPath(graticule, '#6392b04a', 0.65);

  plane.beginPath();
  path(land);
  const terrain = plane.createLinearGradient(x - radius, y - radius, x + radius, y + radius);
  terrain.addColorStop(0, '#427d71');
  terrain.addColorStop(0.55, '#2c625f');
  terrain.addColorStop(1, '#193e48');
  plane.fillStyle = terrain;
  plane.fill();
  plane.strokeStyle = '#8bc9b799';
  plane.lineWidth = 0.75;
  plane.stroke();
  drawPath(graticule, '#a9d2cc18', 0.65);

  const shade = plane.createRadialGradient(x - radius * 0.33, y - radius * 0.32, radius * 0.35, x, y, radius);
  shade.addColorStop(0, '#08111e00');
  shade.addColorStop(0.7, '#08111e0c');
  shade.addColorStop(1, '#08111e75');
  spot(x, y, radius, shade);
  drawPath({ type: 'Sphere' }, '#81c0ed9c', 1.25);
}

function visible(point) {
  return d3.geoDistance(view.center, point) < Math.PI / 2;
}

function drawFlight(time) {
  plane.setLineDash(trip.landed ? [] : [3, 5]);
  drawPath({ type: 'LineString', coordinates: trip.route }, '#ffb37cdb', 1.5);
  plane.setLineDash([]);

  if (visible(trip.to.point)) {
    const [x, y] = projection(trip.to.point);
    spot(x, y, 8, '#ffad7063');
    spot(x, y, 4, '#ffe7c7');
  }
  if (!visible(trip.point)) return;

  const [x, y] = projection(trip.point);
  const size = clamp(view.radius * 0.48, 59, 125);
  const quiet = trip.paused || motionPreference.matches;
  const wobble = quiet ? 0 : Math.sin(time / (trip.landed ? 270 : 158));
  const hover = trip.landed ? 5 : 17;
  const foot = y - hover + wobble * (trip.landed ? 1.2 : 2.8);
  spot(x, y, 5, '#ffb27d7d');
  plane.save();
  plane.translate(x, foot);
  plane.rotate(wobble * (trip.landed ? 0.025 : 0.065));
  if (!trip.landed && !quiet) {
    for (let index = 0; index < 4; index++) {
      const age = (time / 390 + index / 4) % 1;
      spot(-size * 0.27 - age * 11, -size * 0.23 + age * 30, (1 - age) * size * 0.044, `rgba(255,156,85,${0.84 - age * 0.61})`);
    }
  }
  if (sprite.complete && sprite.naturalWidth) {
    const width = size * sprite.naturalWidth / sprite.naturalHeight;
    plane.drawImage(sprite, -width / 2, -size, width, size);
  } else {
    spot(0, -9, 6, '#ffaf70');
  }
  plane.restore();
}

function updateCoordinates() {
  const [longitude, latitude] = trip.point;
  const coordinates = `${Math.abs(latitude).toFixed(1)}° ${latitude < 0 ? 'S' : 'N'}  ·  ${Math.abs(longitude).toFixed(1)}° ${longitude < 0 ? 'W' : 'E'}`;
  if (ui.coordinates.textContent !== coordinates) ui.coordinates.textContent = coordinates;
}

function draw(time) {
  frame = null;
  const elapsed = lastTime === null ? 0 : Math.min(time - lastTime, 50);
  lastTime = time;
  if (!trip.paused) advance(elapsed);

  if (view.following) {
    const longitude = wrapLongitude(trip.point[0] + 16);
    const latitude = clamp(trip.point[1] - 13, -68, 68);
    const blend = trip.paused || motionPreference.matches ? 1 : 1 - Math.exp(-elapsed / 260);
    view.center[0] = wrapLongitude(view.center[0] + wrapLongitude(longitude - view.center[0]) * blend);
    view.center[1] += (latitude - view.center[1]) * blend;
  }
  if (view.radius > 0) {
    drawGlobe();
    drawFlight(time);
  }
  updateCoordinates();

  if (trip.paused) lastTime = null;
  else requestDraw();
}

function requestDraw() {
  if (frame === null) frame = requestAnimationFrame(draw);
}

function setFollowing(following) {
  view.following = following;
  ui.follow.setAttribute('aria-pressed', String(following));
  requestDraw();
}

function rotate(longitude, latitude) {
  setFollowing(false);
  view.center[0] = wrapLongitude(view.center[0] + longitude);
  view.center[1] = clamp(view.center[1] + latitude, -85, 85);
}

function installControls() {
  ui.pause.addEventListener('click', () => {
    trip.paused = !trip.paused;
    updateTracker();
    requestDraw();
  });
  ui.skip.addEventListener('click', () => {
    launch(trip.landed ? trip.to : null, trip.point);
    requestDraw();
  });
  ui.follow.addEventListener('click', () => setFollowing(!view.following));
  motionPreference.addEventListener('change', event => {
    if (event.matches) {
      trip.paused = true;
      updateTracker();
      requestDraw();
    }
  });
  sprite.addEventListener('load', requestDraw);

  ui.globe.addEventListener('pointerdown', event => {
    if (event.button !== 0 || cameraDrag) return;
    cameraDrag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    ui.globe.setPointerCapture(event.pointerId);
  });
  ui.globe.addEventListener('pointermove', event => {
    if (event.pointerId !== cameraDrag?.id) return;
    const sensitivity = 74 / view.radius;
    rotate((cameraDrag.x - event.clientX) * sensitivity, (event.clientY - cameraDrag.y) * sensitivity);
    cameraDrag.x = event.clientX;
    cameraDrag.y = event.clientY;
  });
  ui.globe.addEventListener('lostpointercapture', event => {
    if (event.pointerId === cameraDrag?.id) cameraDrag = undefined;
  });
  ui.globe.addEventListener('keydown', event => {
    const direction = { ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, 12], ArrowDown: [0, -12] }[event.key];
    if (!direction) return;
    event.preventDefault();
    rotate(...direction);
  });
}

async function start() {
  try {
    if (!plane) throw new Error('Canvas is unavailable');
    const response = await fetch('assets/land.geojson');
    if (!response.ok) throw new Error(`Map request returned ${response.status}`);
    land = await response.json();
    launch(START);
    updateLog();
    installControls();
    new ResizeObserver(resize).observe(ui.viewport);
    ui['map-message'].hidden = true;
    for (const control of [ui.follow, ui.pause, ui.skip]) control.disabled = false;
    resize();
  } catch (error) {
    ui['map-message'].textContent = 'Couldn’t load the globe. Try refreshing.';
    ui.status.textContent = 'Unavailable';
    console.error(error);
  }
}

start();
