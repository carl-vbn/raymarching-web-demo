import * as THREE from 'three';

// @ts-ignore
import vertexShader from './shaders/vertex.glsl?raw';
// @ts-ignore
import fragmentShader from './shaders/fragment.glsl?raw';
import { EffectComposer, RenderPass, ShaderPass } from 'three/examples/jsm/Addons.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { addButton, addSlider, injectUI } from './ui';

const canvasContainer = document.getElementById('app')!;
let viewportWidth = canvasContainer.getBoundingClientRect().width;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(90, viewportWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(viewportWidth, window.innerHeight, false);
canvasContainer.appendChild(renderer.domElement);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; // for smooth interaction
controls.dampingFactor = 0.05;
controls.screenSpacePanning = true;
controls.minDistance = 1;
controls.maxDistance = 500;

let lightAzimuth = Math.PI;
let lightElevation = - Math.PI / 4;

function getLightDirection() {
  const x = Math.sin(lightAzimuth) * Math.cos(lightElevation);
  const y = Math.sin(lightElevation);
  const z = Math.cos(lightAzimuth) * Math.cos(lightElevation);
  return new THREE.Vector3(x, y, z).normalize();
}

const userParameters = [
  { uniform: 'fBlendingFactor', display: 'Blending', default: 0.5, category: '1#Scene' }
];

const vaSphereColors = [
  new THREE.Color(0xff0000),
  new THREE.Color(0x00ff00),
  new THREE.Color(0x0000ff)
];

const hoveredSphereColors = [
  new THREE.Color(0xffAAAA),
  new THREE.Color(0xAAffAA),
  new THREE.Color(0xAAAAff)
];

let fTime = 0;
let paused = false;

const geometry = new THREE.SphereGeometry(1);
const spheres = [
  new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: vaSphereColors[0], wireframe: true })),
  new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: vaSphereColors[1], wireframe: true })),
  new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: vaSphereColors[2], wireframe: true }))
];

let grabbedSphere: THREE.Mesh | null = null;
let lastGrabPos: THREE.Vector3 | null = null;
let grabDistance = 0;
let isHoveringSphere = false;

spheres.forEach(sphere => scene.add(sphere));
spheres.forEach(sphere => sphere.visible = false);
spheres.forEach((sphere, index) => sphere.userData.index = index);

// Shader
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const raymarchingPass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    fTime: { value: fTime },
    vResolution: { value: new THREE.Vector2(viewportWidth, window.innerHeight) },
    vaSpherePositions: { value: spheres.map(sphere => sphere.position) },
    vaSphereColors: { value: spheres.map(sphere => sphere.material.color) },
    faSphereRadii: { value: spheres.map(sphere => sphere.geometry.parameters.radius) },
    vCameraPosition: { value: camera.position },
    vCameraRotation: { value: camera.quaternion },
    vLightDirection: { value: getLightDirection() },
    ...userParameters.reduce((acc: any, param) => {
      acc[param.uniform] = { value: param.default };
      return acc;
    }, {})
  },
  vertexShader,
  fragmentShader,
});
composer.addPass(raymarchingPass);

camera.position.z = 5;

// Animation loop
function animate() {
  requestAnimationFrame(animate);

  const dt = 0.02;
  
  if (!paused) {
    fTime += dt;
    raymarchingPass.uniforms.fTime.value = fTime;  
  }

  raymarchingPass.uniforms.vaSpherePositions.value = spheres.map(sphere => sphere.position);

  controls.update();
  raymarchingPass.uniforms.vCameraPosition.value = camera.position;
  raymarchingPass.uniforms.vCameraRotation.value = camera.quaternion;
  composer.render();

}

function raycastSphere(mouseX: number, mouseY: number) {
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2(
    (mouseX / viewportWidth) * 2 - 1,
    -(mouseY / window.innerHeight) * 2 + 1
  );
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(spheres);
  if (intersects.length > 0) {
    return intersects[0].object as THREE.Mesh;
  }

  return null;
}

window.addEventListener('resize', () => {
  viewportWidth = canvasContainer.getBoundingClientRect().width;
  camera.aspect = viewportWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(viewportWidth, window.innerHeight, false);

  raymarchingPass.uniforms.vResolution.value.set(viewportWidth, window.innerHeight);
});

window.addEventListener('mousemove', (event) => {
  spheres.forEach((sphere, index) => {
    (sphere.material as THREE.MeshBasicMaterial).color.set(vaSphereColors[index]);
    sphere.userData.hovered = false;
  });

  const hoveredSphere = raycastSphere(event.clientX, event.clientY);
  if (hoveredSphere) {
    (hoveredSphere.material as THREE.MeshBasicMaterial).color.set(hoveredSphereColors[hoveredSphere.userData.index]);
    hoveredSphere.userData.hovered = true;

    if (!isHoveringSphere) {
      isHoveringSphere = true;
      renderer.domElement.style.cursor = 'grab';
    }
  } else if (isHoveringSphere) {
    isHoveringSphere = false;
    renderer.domElement.style.cursor = 'auto';
  }

  if (grabbedSphere) {
    const mouse = new THREE.Vector2(
      (event.clientX / viewportWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1
    );

    const vector = new THREE.Vector3(mouse.x, mouse.y, 0);
    vector.unproject(camera);
    vector.sub(camera.position).normalize();
    vector.multiplyScalar(grabDistance);
    vector.add(camera.position);
    
    if (lastGrabPos) {
      const delta = new THREE.Vector3();
      delta.subVectors(vector, lastGrabPos);
      grabbedSphere.position.add(delta);
    }
    lastGrabPos = vector;
  }
});


window.addEventListener('mousedown', (event) => {
  const clickedSphere = raycastSphere(event.clientX, event.clientY);
  if (clickedSphere) {
    if (!grabbedSphere) {
      renderer.domElement.style.cursor = 'grabbing';
    }

    grabbedSphere = clickedSphere;
    controls.enabled = false;
    lastGrabPos = null;
    grabDistance = clickedSphere.position.distanceTo(camera.position);
  }
});

window.addEventListener('mouseup', () => {
  if (grabbedSphere) {
    grabbedSphere = null;
    controls.enabled = true;
    renderer.domElement.style.cursor = 'grab';
  }
});

window.addEventListener('keydown', (event) => {
  if (event.key === ' ') {
    paused = !paused;
  }
});

for (const param of userParameters) {
  addSlider(param.display, { default: param.default }, (v) => {
    raymarchingPass.uniforms[param.uniform].value = v;
  }, param.category);
}

addSlider('Light Azimuth', { default: lightAzimuth, max: 2 * Math.PI, displayMax: 360 }, (v) => {
  lightAzimuth = v;
  raymarchingPass.uniforms.vLightDirection.value = getLightDirection();
}, '1#Scene');
addSlider('Light Elevation', { default: lightElevation, min: Math.PI / 2, max: -Math.PI / 2, displayMin: -90, displayMax: 90 }, (v) => {
  lightElevation = v;
  raymarchingPass.uniforms.vLightDirection.value = getLightDirection();
}, '1#Scene');

addButton('Add sphere', () => {
  const newSphere = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: vaSphereColors[spheres.length % vaSphereColors.length], wireframe: true }));
  newSphere.userData.index = spheres.length;
  spheres.push(newSphere);
  scene.add(newSphere);
  console.log('Added sphere', newSphere.userData.index);
}, "2#Spheres");

injectUI();

animate();