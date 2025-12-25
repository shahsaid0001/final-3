const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(4, 4, 6);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// Light
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(5, 5, 5);
scene.add(dirLight);

// Cube data
const cubeData = [
  { title: "music", text: "Музыкальный контент" },
  { title: "news", text: "Новостной контент" },
  { title: "search", text: "Поисковые запросы" },
  { title: "podcast", text: "Подкасты и аудио" },
  { title: "analytics", text: "Аналитические данные" },
  { title: "users", text: "Активность пользователей" }
];

const materials = cubeData.map(() =>
  new THREE.MeshStandardMaterial({
    color: 0x4f80ff,
    transparent: true,
    opacity: 0.85
  })
);

const geometry = new THREE.BoxGeometry(2, 2, 2);
const cube = new THREE.Mesh(geometry, materials);
scene.add(cube);

// Interaction
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener("click", event => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(cube);

  if (intersects.length > 0) {
    const faceIndex = Math.floor(intersects[0].faceIndex / 2);
    const data = cubeData[faceIndex];
    showInfo(data.title, data.text);
  }
});

function showInfo(title, text) {
  document.getElementById("title").innerText = title;
  document.getElementById("content").innerText = text;
  document.getElementById("info").style.display = "block";
}

document.getElementById("close").onclick = () => {
  document.getElementById("info").style.display = "none";
};

function animate() {
  requestAnimationFrame(animate);
  cube.rotation.y += 0.005;
  cube.rotation.x += 0.003;
  renderer.render(scene, camera);
}
animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
