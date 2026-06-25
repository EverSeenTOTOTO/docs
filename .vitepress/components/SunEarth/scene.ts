import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * 日地模型 —— 领域常量（统一语言 / 物理参数）
 *
 * 演示目标：昼夜交替（自转）、昼夜长短变化与四季（黄赤交角 + 公转）。
 * 关键事实：四季与昼夜长短变化由「地轴倾斜」决定，与日地距离无关——
 * 地球 1 月初过近日点时恰是北半球冬季。
 */
const OBLIQUITY = THREE.MathUtils.degToRad(23.5); // 黄赤交角（地轴与公转面法线夹角）
const ECCENTRICITY = 0.3; // 离心率：真实值约 0.017，此处视觉夸大以凸显近日/远日点
const SEMI_MAJOR = 14; // 半长轴（场景单位，尺度已压缩以便同时看到日地）
const EARTH_RADIUS = 1.6;
const SUN_RADIUS = 2.6;

/** 地轴倾斜的方位角：让节气位置与近日点(ν=0)/远日点(ν=π)错开，避免学生误解 */
const SEASON_AZIMUTH = Math.PI / 4;

const REVOLUTION_PERIOD = 90; // 一个公转周期（秒）—— 慢，便于观察
const SPIN_PERIOD = 7; // 一个自转周期（秒）—— 明显快于公转但仍偏慢

const TWO_PI = Math.PI * 2;

const COLORS = {
  sun: 0xffcc33,
  sunLight: 0xfff3d0,
  earth: 0x2f74b5,
  equator: 0xff7a33,
  tropic: 0xffd24a,
  meridian: 0xbfe3ff,
  axis: 0xffffff,
  northPole: 0xff5a5a,
  southPole: 0x57c8ff,
  subsolar: 0xffec3d,
  orbit: 0x6f7fa6,
  perihelion: 0xff8c42,
  aphelion: 0x8ab4ff,
  season: 0xcfe0ff,
};

interface LabelOptions {
  color?: string;
  bg?: string;
  scale?: number;
  depthTest?: boolean;
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

/** 由平近点角 M 解开普勒方程得偏近点角 E（牛顿迭代） */
function solveKepler(M: number, e: number): number {
  let E = M;
  for (let i = 0; i < 6; i++) {
    E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  }
  return E;
}

/** 偏近点角 → 真近点角 */
function trueAnomaly(E: number, e: number): number {
  return 2 * Math.atan2(
    Math.sqrt(1 + e) * Math.sin(E / 2),
    Math.sqrt(1 - e) * Math.cos(E / 2),
  );
}

/** 真近点角 ν → 轨道平面内位置（太阳在原点/焦点，近日点 +x） */
function orbitPosFromNu(nu: number, a: number, e: number): THREE.Vector3 {
  const r = (a * (1 - e * e)) / (1 + e * Math.cos(nu));
  return new THREE.Vector3(r * Math.cos(nu), 0, r * Math.sin(nu));
}

/** 画一条纬线圆环（在 axisGroup 局部坐标，Y 为自转轴） */
function latitudeRing(
  radius: number,
  latRad: number,
  color: number,
  opts: { dashed?: boolean; opacity?: number } = {},
): THREE.Line {
  const r = radius * Math.cos(latRad);
  const y = radius * Math.sin(latRad);
  const pts: THREE.Vector3[] = [];
  const seg = 128;
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * TWO_PI;
    pts.push(new THREE.Vector3(r * Math.cos(a), y, r * Math.sin(a)));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = opts.dashed
    ? new THREE.LineDashedMaterial({
        color,
        dashSize: 0.18,
        gapSize: 0.12,
        transparent: true,
        opacity: opts.opacity ?? 0.9,
      })
    : new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: opts.opacity ?? 0.9,
      });
  const line = new THREE.Line(geo, mat);
  if (opts.dashed) line.computeLineDistances();
  return line;
}

/** 画一条经线（过两极的大圆，加到 earthMesh 上随自转旋转） */
function meridian(radius: number, longitudeRad: number, color: number, opacity: number): THREE.Line {
  const pts: THREE.Vector3[] = [];
  const seg = 64;
  for (let i = 0; i <= seg; i++) {
    const t = (i / seg) * Math.PI; // 0..π，从北极到南极
    pts.push(
      new THREE.Vector3(
        radius * Math.sin(t) * Math.cos(longitudeRad),
        radius * Math.cos(t),
        radius * Math.sin(t) * Math.sin(longitudeRad),
      ),
    );
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  return new THREE.Line(geo, mat);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  if (typeof (ctx as any).roundRect === 'function') {
    (ctx as any).roundRect(x, y, w, h, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
}

/** 文字标签（Sprite，始终面向相机） */
function makeLabel(text: string, opts: LabelOptions = {}): THREE.Sprite {
  const cvs = document.createElement('canvas');
  cvs.width = 512;
  cvs.height = 128;
  const ctx = cvs.getContext('2d')!;
  ctx.fillStyle = opts.bg ?? 'rgba(18,22,40,0.62)';
  ctx.beginPath();
  roundRect(ctx, 6, 6, cvs.width - 12, cvs.height - 12, 26);
  ctx.fill();
  ctx.font = 'bold 64px system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillStyle = opts.color ?? '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cvs.width / 2, cvs.height / 2 + 4);
  const tex = new THREE.CanvasTexture(cvs);
  tex.minFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: opts.depthTest ?? false,
    depthWrite: false,
  });
  const sp = new THREE.Sprite(mat);
  const scale = opts.scale ?? 3.2;
  sp.scale.set(scale, scale * 0.25, 1);
  return sp;
}

export class SunEarthScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;

  /** 主暂停：暂停后公转与自转都停止 */
  paused = false;
  /** 自转开关：仅在未主暂停时生效 */
  spinEnabled = true;

  private container: HTMLElement;
  private dom: HTMLCanvasElement;
  private axisDir: THREE.Vector3; // 自转轴方向（世界坐标，恒定）

  private earthAnchor: THREE.Group; // 仅平移，定位地球中心
  private axisGroup: THREE.Group; // 固定倾角（地轴方向恒定）
  private earthMesh: THREE.Mesh;
  private earthHit: THREE.Mesh; // 透明放大命中体，便于拖拽
  private sunHit: THREE.Mesh; // 太阳命中体，拖拽以平移视角
  private subsolarMarker: THREE.Mesh;

  private meanAnomaly = 0; // 公转状态（平近点角，随时间线性增加）
  private spinAngle = 0; // 自转角度

  /** 视角方向（从目标指向相机的单位向量）与自动取景包围半径 */
  private readonly viewDir = new THREE.Vector3(4, 13, 27).normalize();
  private readonly frameRadius = 16; // ≈ 轨道最大半幅（±14）+ 余量
  private clock = new THREE.Clock();
  private rafId = 0;
  private disposed = false;
  private resizeObserver: ResizeObserver;

  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private dragging = false;
  private lastClientX = 0;
  private panning = false;
  private panLastX = 0;
  private panLastY = 0;

  /** 太阳直射点纬度变化回调（度） */
  onSubsolarLatChange?: (latDeg: number) => void;

  constructor(container: HTMLElement) {
    this.container = container;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 520;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070b1a);

    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 4000);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);
    this.dom = this.renderer.domElement;
    this.dom.style.touchAction = 'none';

    this.controls = new OrbitControls(this.camera, this.dom);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 160;
    // 以椭圆中心（而非太阳）为视角中心，让整个轨道更居中、更饱满
    this.controls.target.set(-SEMI_MAJOR * ECCENTRICITY, 0, 0);
    this.fitCamera();

    // 自转轴方向（世界坐标恒定）：从 +Y 向方位角 SEASON_AZIMUTH 倾斜 OBLIQUITY
    this.axisDir = new THREE.Vector3(
      Math.sin(OBLIQUITY) * Math.cos(SEASON_AZIMUTH),
      Math.cos(OBLIQUITY),
      Math.sin(OBLIQUITY) * Math.sin(SEASON_AZIMUTH),
    ).normalize();

    this.buildSun();
    this.buildOrbit();
    this.buildEarth();
    this.buildLighting();

    this.setupInteraction();

    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(container);

    this.clock.start();
    this.animate();
  }

  private buildSun() {
    const geo = new THREE.SphereGeometry(SUN_RADIUS, 48, 48);
    const mat = new THREE.MeshBasicMaterial({ color: COLORS.sun });
    const sun = new THREE.Mesh(geo, mat);
    this.scene.add(sun);

    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(SUN_RADIUS * 1.35, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd86b, transparent: true, opacity: 0.16, side: THREE.BackSide }),
    );
    this.scene.add(halo);

    // 太阳命中体（不可见，略大于本体），用于「拖拽太阳 → 平移视角」
    this.sunHit = new THREE.Mesh(
      new THREE.SphereGeometry(SUN_RADIUS * 1.4, 24, 24),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    this.scene.add(this.sunHit);
  }

  private buildOrbit() {
    // 椭圆轨道线（太阳在焦点/原点）：以偏近点角均匀采样得到平滑椭圆
    const pts: THREE.Vector3[] = [];
    const seg = 256;
    const b = SEMI_MAJOR * Math.sqrt(1 - ECCENTRICITY * ECCENTRICITY);
    for (let i = 0; i <= seg; i++) {
      const E = (i / seg) * TWO_PI;
      pts.push(new THREE.Vector3(SEMI_MAJOR * (Math.cos(E) - ECCENTRICITY), 0, b * Math.sin(E)));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    this.scene.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: COLORS.orbit, transparent: true, opacity: 0.55 })));

    const mkPoint = (pos: THREE.Vector3, color: number, label: string) => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.32, 16, 16),
        new THREE.MeshBasicMaterial({ color }),
      );
      m.position.copy(pos);
      this.scene.add(m);
      const lb = makeLabel(label, { color: '#fff', scale: 3 });
      lb.position.copy(pos).add(new THREE.Vector3(0, 1.4, 0));
      this.scene.add(lb);
    };

    // 近日点 ν=0 (+x)、远日点 ν=π (-x)
    mkPoint(orbitPosFromNu(0, SEMI_MAJOR, ECCENTRICITY), COLORS.perihelion, '近日点');
    mkPoint(orbitPosFromNu(Math.PI, SEMI_MAJOR, ECCENTRICITY), COLORS.aphelion, '远日点');

    // 节气（北半球）：与地轴方位角 SEASON_AZIMUTH 配合，太阳直射点纬度 = asin(-sinε·cos(ν-α))
    // ν=α 冬至、ν=α+π/2 春分、ν=α+π 夏至、ν=α+3π/2 秋分
    const seasons: Array<[number, string]> = [
      [SEASON_AZIMUTH, '冬至'],
      [SEASON_AZIMUTH + Math.PI / 2, '春分'],
      [SEASON_AZIMUTH + Math.PI, '夏至'],
      [SEASON_AZIMUTH + (3 * Math.PI) / 2, '秋分'],
    ];
    for (const [nu, name] of seasons) {
      const pos = orbitPosFromNu(nu, SEMI_MAJOR, ECCENTRICITY);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.5, 0.66, 32),
        new THREE.MeshBasicMaterial({ color: COLORS.season, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(pos);
      this.scene.add(ring);
      const lb = makeLabel(name, { color: '#dbe8ff', scale: 2.6 });
      lb.position.copy(pos).add(new THREE.Vector3(0, -1.6, 0));
      this.scene.add(lb);
    }
  }

  private buildEarth() {
    this.earthAnchor = new THREE.Group(); // 仅平移
    this.scene.add(this.earthAnchor);

    this.axisGroup = new THREE.Group(); // 固定倾角
    this.axisGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.axisDir);
    this.earthAnchor.add(this.axisGroup);

    const earthGeo = new THREE.SphereGeometry(EARTH_RADIUS, 64, 64);
    const earthMat = new THREE.MeshStandardMaterial({
      color: COLORS.earth,
      roughness: 0.85,
      metalness: 0.0,
    });
    this.earthMesh = new THREE.Mesh(earthGeo, earthMat);
    this.axisGroup.add(this.earthMesh);

    // 透明放大命中体，便于用鼠标「抓取」地球拖拽公转
    this.earthHit = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS * 1.7, 24, 24),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    this.earthAnchor.add(this.earthHit);

    // 纬线：赤道（橙）、北回归线 / 南回归线（黄虚线）
    this.axisGroup.add(latitudeRing(EARTH_RADIUS, 0, COLORS.equator, { opacity: 0.95 }));
    this.axisGroup.add(latitudeRing(EARTH_RADIUS, OBLIQUITY, COLORS.tropic, { dashed: true, opacity: 0.95 }));
    this.axisGroup.add(latitudeRing(EARTH_RADIUS, -OBLIQUITY, COLORS.tropic, { dashed: true, opacity: 0.95 }));

    // 经线：随自转旋转，让「自转」可见
    for (let i = 0; i < 6; i++) {
      this.earthMesh.add(meridian(EARTH_RADIUS, (i / 6) * Math.PI, COLORS.meridian, 0.35));
    }

    // 自转轴（穿出两极的直线）
    const axisGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -EARTH_RADIUS * 1.55, 0),
      new THREE.Vector3(0, EARTH_RADIUS * 1.55, 0),
    ]);
    this.axisGroup.add(new THREE.Line(axisGeo, new THREE.LineBasicMaterial({ color: COLORS.axis, transparent: true, opacity: 0.9 })));

    // 南北极标记
    const poleGeo = new THREE.SphereGeometry(0.16, 16, 16);
    const nPole = new THREE.Mesh(poleGeo, new THREE.MeshBasicMaterial({ color: COLORS.northPole }));
    nPole.position.set(0, EARTH_RADIUS, 0);
    this.axisGroup.add(nPole);
    const sPole = new THREE.Mesh(poleGeo, new THREE.MeshBasicMaterial({ color: COLORS.southPole }));
    sPole.position.set(0, -EARTH_RADIUS, 0);
    this.axisGroup.add(sPole);

    const nLabel = makeLabel('北极', { color: '#ffd0d0', scale: 2.2 });
    nLabel.position.set(0, EARTH_RADIUS + 1.0, 0);
    this.axisGroup.add(nLabel);
    const sLabel = makeLabel('南极', { color: '#cfeaff', scale: 2.2 });
    sLabel.position.set(0, -EARTH_RADIUS - 1.0, 0);
    this.axisGroup.add(sLabel);

    // 太阳直射点标记（在 earthAnchor 中按「地心→太阳」方向每帧重定位，不随自转旋转）
    this.subsolarMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 16, 16),
      new THREE.MeshBasicMaterial({ color: COLORS.subsolar }),
    );
    this.earthAnchor.add(this.subsolarMarker);
    const subLabel = makeLabel('太阳直射点', { color: '#fff7c2', scale: 2.2 });
    subLabel.position.set(0, 0.9, 0);
    this.subsolarMarker.add(subLabel);

    this.earthAnchor.position.copy(orbitPosFromNu(this.meanAnomaly, SEMI_MAJOR, ECCENTRICITY));
  }

  private buildLighting() {
    // 太阳作为点光源（衰减为 0：近日点/远日点亮度一致，便于清晰观察昼夜）
    const sunLight = new THREE.PointLight(COLORS.sunLight, 2.6, 0, 0);
    this.scene.add(sunLight);
    // 极弱环境光：夜半球不致纯黑，但仍与昼半球对比明显
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.14));
  }

  private setupInteraction() {
    // 捕获阶段 + 挂在 container（canvas 的父节点）上：确保先于 OrbitControls（挂在 canvas 上）判定，
    // 命中地球时即可在事件抵达 canvas 前关闭视角旋转。
    this.container.addEventListener('pointerdown', this.onPointerDown, true);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
  }

  private updatePointer(e: PointerEvent) {
    const rect = this.dom.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private onPointerDown = (e: PointerEvent) => {
    this.updatePointer(e);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    if (this.raycaster.intersectObject(this.earthHit, false).length) {
      // 命中地球：进入「拖拽公转」模式
      this.dragging = true;
      this.lastClientX = e.clientX;
      this.controls.enabled = false;
      this.dom.style.cursor = 'grabbing';
      e.stopPropagation();
      return;
    }
    if (this.raycaster.intersectObject(this.sunHit, false).length) {
      // 命中太阳：进入「拖拽平移」模式
      this.panning = true;
      this.panLastX = e.clientX;
      this.panLastY = e.clientY;
      this.controls.enabled = false;
      this.dom.style.cursor = 'grabbing';
      e.stopPropagation();
      return;
    }
    // 未命中：交给 OrbitControls 旋转视角
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.dragging) {
      const dx = e.clientX - this.lastClientX;
      this.lastClientX = e.clientX;
      this.meanAnomaly = mod(this.meanAnomaly + dx * 0.006, TWO_PI); // 左右拖拽 → 改变公转位置
      return;
    }
    if (this.panning) {
      const dx = e.clientX - this.panLastX;
      const dy = e.clientY - this.panLastY;
      this.panLastX = e.clientX;
      this.panLastY = e.clientY;
      this.pan(dx, dy); // 拖拽太阳 → 平移整个太阳系
      return;
    }
  };

  private onPointerUp = () => {
    if (this.dragging) {
      this.dragging = false;
      this.controls.enabled = true;
      this.dom.style.cursor = '';
    }
    if (this.panning) {
      this.panning = false;
      this.controls.enabled = true;
      this.dom.style.cursor = '';
    }
  };

  private onResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.fitCamera();
  }

  private update() {
    const dt = this.clock.getDelta();
    if (!this.paused) {
      this.meanAnomaly = mod(this.meanAnomaly + (TWO_PI / REVOLUTION_PERIOD) * dt, TWO_PI);
      if (this.spinEnabled) {
        this.spinAngle = mod(this.spinAngle + (TWO_PI / SPIN_PERIOD) * dt, TWO_PI);
      }
    }

    // 开普勒方程：平近点角 → 偏近点角 → 真近点角 → 位置（近日点更快，符合开普勒第二定律）
    const E = solveKepler(this.meanAnomaly, ECCENTRICITY);
    const nu = trueAnomaly(E, ECCENTRICITY);
    const pos = orbitPosFromNu(nu, SEMI_MAJOR, ECCENTRICITY);
    this.earthAnchor.position.copy(pos);
    this.earthMesh.rotation.y = this.spinAngle;

    // 太阳直射点：地心→太阳方向上的地表点
    const sunDir = pos.clone().multiplyScalar(-1).normalize();
    this.subsolarMarker.position.copy(sunDir).multiplyScalar(EARTH_RADIUS + 0.05);

    const lat = Math.asin(THREE.MathUtils.clamp(this.axisDir.dot(sunDir), -1, 1));
    this.onSubsolarLatChange?.(THREE.MathUtils.radToDeg(lat));
  }

  private animate = () => {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(this.animate);
    this.update();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  setDark(isDark: boolean) {
    this.scene.background = new THREE.Color(isDark ? 0x05070f : 0x0b1230);
  }

  /** 根据当前画布宽高比自动取景，让轨道始终填满视口（主要内容更大） */
  fitCamera() {
    const halfFov = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const dist =
      this.frameRadius / (Math.tan(halfFov) * Math.min(1, this.camera.aspect)) * 1.05;
    this.camera.position.copy(this.controls.target).addScaledVector(this.viewDir, dist);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  /** 平移视角：相机与目标同步移动，实现「拖拽太阳 → 平移整个太阳系」 */
  private pan(dxPx: number, dyPx: number) {
    const dist = this.camera.position.distanceTo(this.controls.target);
    // 当前距离下「每个像素对应的世界单位」，使平移手感与缩放等级一致
    const worldPerPx =
      (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * dist) / this.dom.clientHeight;
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    this.camera.matrixWorld.extractBasis(right, up, new THREE.Vector3());
    const move = new THREE.Vector3()
      .addScaledVector(right, -dxPx * worldPerPx) // 拖拽方向 = 内容移动方向（相机反向移动）
      .addScaledVector(up, dyPx * worldPerPx);
    this.camera.position.add(move);
    this.controls.target.add(move);
  }

  reset() {
    this.meanAnomaly = 0;
    this.spinAngle = 0;
    this.controls.target.set(-SEMI_MAJOR * ECCENTRICITY, 0, 0);
    this.fitCamera();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    this.container.removeEventListener('pointerdown', this.onPointerDown, true);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => this.disposeMaterial(m));
      else if (mat) this.disposeMaterial(mat);
    });
    this.renderer.dispose();
    if (this.dom.parentElement === this.container) {
      this.container.removeChild(this.dom);
    }
  }

  private disposeMaterial(m: THREE.Material) {
    const anyMat = m as unknown as { map?: THREE.Texture };
    anyMat.map?.dispose();
    m.dispose();
  }
}
