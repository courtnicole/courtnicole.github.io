import {
  PerspectiveCamera,
  WebGLRenderer,
  Scene,
  DirectionalLight,
  Mesh,
  ACESFilmicToneMapping,
  PCFSoftShadowMap,
  MeshPhongMaterial,
  AmbientLight,
  ColorManagement,
  TextureLoader,
  Vector2,
  Float32BufferAttribute,
  BufferGeometry,
  Raycaster,
  Vector3,
  MeshBasicMaterial,
  Quaternion,
  PlaneGeometry,
} from "three";
import { WebGL } from "three/examples/jsm/Addons.js";
import { clamp } from "three/src/math/MathUtils.js";

let scene, camera, renderer;
let geometry, material, materialShader, plane, rayPlane, rayMaterial, directionalLight;
let vHeight, vWidth, pHeight, pWidth, amplitude, period, cells;
let pointerMoved = false;

//prefix for noise material + uniforms
const vertexNoisePrefix = /*glsl*/ `
uniform float time;
uniform float vWidthInv;
uniform float vHeightInv;
uniform float amplitude;
uniform vec2 period;
uniform float hitSize;

varying vec3 vertColor;
varying vec3 vertColor2;
uniform sampler2D vivid;

uniform vec3 hitPoint;

vec4 permute(vec4 i) {
  vec4 im = mod(i, 289.0);
  return mod(((im*34.0)+10.0)*im, 289.0);
}

// Authors: Stefan Gustavson (stefan.gustavson@gmail.com) and Ian McEwan (ijm567@gmail.com)
// Version 2021-12-02, published under the MIT license
// Copyright (c) 2021 Stefan Gustavson and Ian McEwan.
float psrdnoise(vec3 x, vec3 period, float alpha, out vec3 gradient) {
  const mat3 M = mat3(0.0, 1.0, 1.0, 1.0, 0.0, 1.0,  1.0, 1.0, 0.0);
  const mat3 Mi = mat3(-0.5, 0.5, 0.5, 0.5,-0.5, 0.5, 0.5, 0.5,-0.5);
  vec3 uvw = M * x;
  vec3 i0 = floor(uvw), f0 = fract(uvw);
  vec3 g_ = step(f0.xyx, f0.yzz), l_ = 1.0 - g_;
  vec3 g = vec3(l_.z, g_.xy), l = vec3(l_.xy, g_.z);
  vec3 o1 = min( g, l ), o2 = max( g, l );
  vec3 i1 = i0 + o1, i2 = i0 + o2, i3 = i0 + vec3(1.0);
  vec3 v0 = Mi * i0, v1 = Mi * i1, v2 = Mi * i2, v3 = Mi * i3;
  vec3 x0 = x - v0, x1 = x - v1, x2 = x - v2, x3 = x - v3;
  if(any(greaterThan(period, vec3(0.0)))) {
  vec4 vx = vec4(v0.x, v1.x, v2.x, v3.x);
  vec4 vy = vec4(v0.y, v1.y, v2.y, v3.y);
  vec4 vz = vec4(v0.z, v1.z, v2.z, v3.z);
  if(period.x > 0.0) vx = mod(vx, period.x);
  if(period.y > 0.0) vy = mod(vy, period.y);
  if(period.z > 0.0) vz = mod(vz, period.z);
  i0 = floor(M * vec3(vx.x, vy.x, vz.x) + 0.5);
  i1 = floor(M * vec3(vx.y, vy.y, vz.y) + 0.5);
  i2 = floor(M * vec3(vx.z, vy.z, vz.z) + 0.5);
  i3 = floor(M * vec3(vx.w, vy.w, vz.w) + 0.5);
  }
  vec4 hash = permute( permute( permute(
            vec4(i0.z, i1.z, i2.z, i3.z ))
          + vec4(i0.y, i1.y, i2.y, i3.y ))
          + vec4(i0.x, i1.x, i2.x, i3.x ));
  vec4 theta = hash * 3.883222077;
  vec4 sz = hash * -0.006920415 + 0.996539792;
  vec4 psi = hash * 0.108705628;
  vec4 Ct = cos(theta), St = sin(theta);
  vec4 sz_prime = sqrt( 1.0 - sz*sz );
  vec4 gx, gy, gz;
  if(alpha != 0.0) {
  vec4 px = Ct * sz_prime, py = St * sz_prime, pz = sz;
  vec4 Sp = sin(psi), Cp = cos(psi), Ctp = St*Sp - Ct*Cp;
  vec4 qx = mix( Ctp*St, Sp, sz), qy = mix(-Ctp*Ct, Cp, sz);
  vec4 qz = -(py*Cp + px*Sp);
  vec4 Sa = vec4(sin(alpha)), Ca = vec4(cos(alpha));
  gx = Ca*px + Sa*qx; gy = Ca*py + Sa*qy; gz = Ca*pz + Sa*qz;
  }
  else {
  gx = Ct * sz_prime; gy = St * sz_prime; gz = sz;
  }
  vec3 g0 = vec3(gx.x, gy.x, gz.x), g1 = vec3(gx.y, gy.y, gz.y);
  vec3 g2 = vec3(gx.z, gy.z, gz.z), g3 = vec3(gx.w, gy.w, gz.w);
  vec4 w = 0.5-vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3));
  w = max(w, 0.0); vec4 w2 = w * w, w3 = w2 * w;
  vec4 gdotx = vec4(dot(g0,x0), dot(g1,x1), dot(g2,x2), dot(g3,x3));
  float n = dot(w3, gdotx);
  vec4 dw = -6.0 * w2 * gdotx;
  vec3 dn0 = w3.x * g0 + dw.x * x0;
  vec3 dn1 = w3.y * g1 + dw.y * x1;
  vec3 dn2 = w3.z * g2 + dw.z * x2;
  vec3 dn3 = w3.w * g3 + dw.w * x3;
  gradient = 39.5 * (dn0 + dn1 + dn2 + dn3);
  return 39.5 * n;
}



`;
//super basic noise shader to displace planar geometry (runs on mobile)
const vertexNoiseBody = /*glsl*/ `
    vec3 gradient;
    vec3 gradient2;
    vec2 vPos = vec2(position.x * vWidthInv, position.y * vHeightInv);
    float s_noise = psrdnoise(vec3(vPos.x * period.x, vPos.y * period.y, time), vec3(5.12, 4.0, 13.24), 1.571, gradient);
    float s_noise2 = psrdnoise(vec3(vPos.x, vPos.y, time), vec3(-5.12, 4.0, -13.24), 1.571, gradient2);
    gradient = normalize(gradient);
    vec3 newPosition = vec3(position.x, position.y, amplitude * s_noise);
    float hitDist = distance(hitPoint.xz, position.xy);
    float wd = max(0.0, 1.0 - (hitDist / hitSize) * (hitDist / hitSize));
    float newHeight = position.z;
    // if (wd > 0.0){
    //   s_noise = smoothstep(0.0, 1.0, wd);
    // }
    newHeight += amplitude * s_noise;
    
    vec3 transformed = vec3(position.x, position.y, newHeight);

    vec3 h = gradient - (dot(gradient, normal) * normal);
    transformedNormal = normalize(normal - (amplitude * h));
    transformedNormal  = normalMatrix * transformedNormal;
    
    #ifndef FLAT_SHADED
	    vNormal = normalize(transformedNormal);
        #ifdef USE_TANGENT
          vTangent = normalize(transformedTangent);
          vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
        #endif
    #endif

    float t = smoothstep(0.0, 1.0, 0.5 * s_noise2 + 0.5);
    float t2 = smoothstep(0.0, 1.0, 0.5 * s_noise + 0.5);
    
    vertColor = texture2D(vivid, vec2(t, 0.)).rgb;
    vertColor2 = texture2D(vivid, vec2(t2, 0.)).rgb;
  `;

const fragmentPrefix = /*glsl*/ `
const float f = 6.239;
uniform float time;
varying vec3 vertColor;
varying vec3 vertColor2;
`;

const fragmentBody = /*glsl*/ `
float t = 0.5 * cos(f * time) + 0.5;
vec3 color = mix(vertColor2, vertColor, t);
diffuseColor.rgb = color;
`;

const loader = new TextureLoader();
const vivid = loader.load("/lookup.png");
vivid.colorSpace = "srgb";

const pointer = new Vector2();
const raycaster = new Raycaster();

const quat = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2 - 0.113);

const canvas = document.getElementById("bg");
if (WebGL.isWebGLAvailable()) {
  init();
} else {
  canvas.appendChild(WebGL.getWebGLErrorMessage());
}

function init() {
  if (!canvas) {
    console.log("No canvas found");
    return;
  }

  ColorManagement.enabled = true;

  camera = new PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(0, 0, 500);

  renderer = new WebGLRenderer({
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.5;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.setSize(window.innerWidth, window.innerHeight);
  canvas.appendChild(renderer.domElement);

  scene = new Scene();
  scene.name = "Scene";

  setSizes();

  const light = new AmbientLight(0xffffff, 0.45);
  scene.add(light);

  directionalLight = new DirectionalLight(0xffffff, 1.45);
  directionalLight.position.set(0, 1, 0);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.width = 512;
  directionalLight.shadow.mapSize.height = 512;
  directionalLight.shadow.camera.left = -0.5 * vWidth;
  directionalLight.shadow.camera.right = 0.5 * vWidth;

  initGeometry();
  initMaterial();
  initMesh();

  directionalLight.target = plane;
  scene.add(directionalLight);

  window.addEventListener("resize", onWindowResize, false);

  document.addEventListener("pointermove", onPointerMove);

  renderer.setAnimationLoop(render);
}

function setSizes() {
  let size = new Vector2();
  camera.getViewSize(500, size);

  vHeight = 1.1 * size.y;
  vWidth = 1.1 * size.x;
  pWidth = 0.5 * vWidth;
  pHeight = 0.5 * vHeight;
  amplitude = 0.0667 * vHeight;
  period = new Vector2(0.0075 * vWidth, 0.0075 * vHeight);
  cells = clamp(Math.ceil(pWidth * 0.6), 100, 350);
}

//Buffer geometry, saves like 0.5MB of memory
//(depending on screen size)
//Worth it...? tbd
//todo: interleave buffer attributes
function initGeometry() {
  const halfWidth = Math.ceil(vWidth) / 2;
  const halfHeight = Math.ceil(vHeight) / 2;

  const positions = [];
  const normals = [];
  const indices = [];

  for (let i = 0; i < cells + 1; i++) {
    const y = Math.ceil(vHeight) * (i / cells) - halfHeight;
    for (let j = 0; j < cells + 1; j++) {
      const x = Math.ceil(vWidth) * (j / cells) - halfWidth;
      positions.push(x, -y, 0);
      normals.push(0, 0, 1);
    }
  }

  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      const a = i * (cells + 1) + (j + 1);
      const b = i * (cells + 1) + j;
      const c = (i + 1) * (cells + 1) + j;
      const d = (i + 1) * (cells + 1) + (j + 1);
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);

  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
}

function initMaterial() {
  material = new MeshPhongMaterial({
    color: 0xffffff,
    specular: 0x222222,
    shininess: 80,
    reflectivity: 0.5,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.time = { value: 0.0 };
    shader.uniforms.hitSize = { value: 30.0 };
    shader.uniforms.vWidthInv = { value: 1 / pWidth };
    shader.uniforms.vHeightInv = { value: 1 / pHeight };
    shader.uniforms.amplitude = { value: amplitude };
    shader.uniforms.period = { value: period };
    shader.uniforms.vivid = { value: vivid };
    shader.uniforms.hitPoint = { value: new Vector3() };

    let token = "#include <common>";

    let insert = vertexNoisePrefix;

    shader.vertexShader = shader.vertexShader.replace(
      token,
      insert + "\n" + token
    );

    token = "#include <normal_vertex>";

    insert = "";

    shader.vertexShader = shader.vertexShader.replace(token, insert);

    token = "#include <begin_vertex>";

    insert = vertexNoiseBody;

    shader.vertexShader = shader.vertexShader.replace(token, insert);

    token = "#include <common>";

    insert = fragmentPrefix;

    shader.fragmentShader = shader.fragmentShader.replace(
      token,
      insert + "\n" + token
    );

    token = "#include <lights_phong_fragment>";

    insert = fragmentBody;

    shader.fragmentShader = shader.fragmentShader.replace(
      token,
      insert + "\n" + token
    );

    materialShader = shader;
  };

  rayMaterial = new MeshBasicMaterial({ color: 0xffffff, visible: false });
}

function initMesh() {
  plane = new Mesh(geometry, material);
  plane.quaternion.set(quat.x, quat.y, quat.z, quat.w);
  plane.position.set(0, -0.36 * vHeight, 0);
  plane.castShadow = true;
  plane.receiveShadow = true;
  scene.add(plane);

  const rayGeometry = new PlaneGeometry(vWidth, vHeight, 1, 1);
  rayPlane = new Mesh(rayGeometry, rayMaterial);
  rayPlane.quaternion.set(quat.x, quat.y, quat.z, quat.w);
  rayPlane.position.set(0, -0.36 * vHeight, 0);
  scene.add(rayPlane);
}

function updatePlaneGeometry() {
  geometry.dispose();
  plane.geometry.dispose();
  rayPlane.geometry.dispose();

  initGeometry();

  directionalLight.shadow.camera.left = -0.5 * vWidth;
  directionalLight.shadow.camera.right = 0.5 * vWidth;

  plane.geometry = geometry;
  plane.position.set(0, -0.36 * vHeight, 0);

  const rayGeometry = new PlaneGeometry(vWidth, vHeight, 1, 1);
  rayPlane.geometry = rayGeometry;
  rayPlane.position.set(0, -0.36 * vHeight, 0);

  if (materialShader) materialShader.uniforms["vWidthInv"].value = 1 / pWidth;
  if (materialShader) materialShader.uniforms["vHeightInv"].value = 1 / pHeight;
  if (materialShader) materialShader.uniforms["amplitude"].value = amplitude;
  if (materialShader) materialShader.uniforms["period"].value = period;
}

function render() {
  if (!canvas) return;

  const now = performance.now() * 0.00015;
  if (materialShader) materialShader.uniforms["time"].value = now;

  if (pointerMoved) {
    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObject(rayPlane);
    if (intersects.length > 0) {
      const point = intersects[0].point;
      if (materialShader) materialShader.uniforms["hitPoint"].value.set(point.x, point.y, -point.z);
    }
    pointerMoved = false;
  }
  else {
    if (materialShader) materialShader.uniforms["hitPoint"].value.set(10000, 10000);
  }

  renderer.render(scene, camera);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  setSizes();
  updatePlaneGeometry();
}

function onPointerMove(event) {

  if (event.isPrimary === false) return;

  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

  pointerMoved = true;
}
