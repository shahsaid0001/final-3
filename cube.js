let scene = new THREE.Scene();

let camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(7, 6, 9);
camera.lookAt(0, 0, 0);

let renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// Свет
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(5, 8, 6);
scene.add(light);

// Данные
let cubeData = {};
fetch("data.json")
  .then(r => r.json())
  .then(data => {
    cubeData = data;
    initCube(Object.keys(data));
  });

function initCube(labels) {
  const colors = [
    0x4f80ff, 0x00c2ff, 0x7c5cff,
    0xff8f4f, 0x4fff8f, 0xff4f7c
  ];

  const materials = labels.map((_, i) =>
    new THREE.MeshStandardMaterial({
      color: colors[i % colors.length],
      transparent: true,
      opacity: 0.9
    })
  );

  const geometry = new THREE.BoxGeometry(3.2, 3.2, 3.2);
  const cube = new THREE.Mesh(geometry, materials);
  scene.add(cube);

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let hovered = null;

  window.addEventListener("mousemove", e => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObject(cube);

    if (hits.length) {
      const f = Math.floor(hits[0].faceIndex / 2);
      if (hovered !== f) {
        if (hovered !== null) cube.material[hovered].opacity = 0.9;
        cube.material[f].opacity = 1;
        hovered = f;
      }
    } else if (hovered !== null) {
      cube.material[hovered].opacity = 0.9;
      hovered = null;
    }
  });

  window.addEventListener("click", e => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObject(cube);

    if (hits.length) {
      const f = Math.floor(hits[0].faceIndex / 2);
      const key = labels[f];
      showInfo(key, cubeData[key]);
    }
  });

  function animate() {
    requestAnimationFrame(animate);
    cube.rotation.y += 0.006;
    cube.rotation.x += 0.004;
    renderer.render(scene, camera);
  }
  animate();
}

// UI
function showInfo(title, text) {
  document.getElementById("title").innerText = title;
  document.getElementById("content").innerText = text;
  document.getElementById("info").style.display = "block";
}

document.getElementById("close").onclick = () => {
  document.getElementById("info").style.display = "none";
};

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
