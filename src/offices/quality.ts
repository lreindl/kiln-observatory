// The Quality auditor's clean room: white, quiet and spare by design. Parts ride
// a conveyor through an inspection arch under a robot magnifier. Working: the
// belt runs and a laser curtain sweeps each part. Complete: a part is flagged
// red, tagged, and lifted off the line into the findings bin.

import * as THREE from "three/webgpu";
import type { PublicEvent } from "../../shared/public";
import { Office, box, clamp01, cyl, ease, glow, mat, sphere, type OfficeOptions } from "./kit";

const BELT_LEN = 10;

export class QualityOffice extends Office {
  camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
  private parts: THREE.Group[] = [];
  private slats: THREE.Mesh[] = [];
  private beltPos = 0;
  private laser: THREE.Mesh;
  private laserMat: THREE.MeshStandardMaterial;
  private arm: { base: THREE.Group; upper: THREE.Group; fore: THREE.Group };
  private reject: THREE.Group | null = null;
  private rejectT = 1;
  private bin: THREE.Group;
  private tag: THREE.Mesh;

  constructor(o: OfficeOptions) {
    super(o);
    const s = this.scene;
    s.background = new THREE.Color(0xe9eef2);
    this.setEnv("#ffffff", "#dfe7ee", "#9aa6b0", 0.9);
    s.add(new THREE.HemisphereLight(0xffffff, 0xb8c4cc, 1.15));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(4, 10, 6);
    s.add(key);

    const white = mat(0xf4f7f9, { rough: 0.35 });
    const grey = mat(0xc9d2d9, { rough: 0.4, metal: 0.3 });
    box(16, 0.2, 12, mat(0xeef2f5, { rough: 0.2 }), 0, -0.1, 0, s);
    // Floor grid lines, sparse.
    for (let x = -8; x <= 8; x += 2) box(0.02, 0.005, 12, mat(0xd2dbe2), x, 0.01, 0, s);
    for (let z = -6; z <= 6; z += 2) box(16, 0.005, 0.02, mat(0xd2dbe2), 0, 0.01, z, s);
    box(16, 6, 0.2, white, 0, 3, -5, s);
    box(0.2, 6, 12, white, -8, 3, 0, s);
    box(4, 0.06, 1, glow(0xffffff, 1.2), -2, 5.9, -2, s); // ceiling light panel
    box(4, 0.06, 1, glow(0xffffff, 1.2), 3, 5.9, -2, s);

    // Conveyor.
    box(BELT_LEN, 0.5, 1.4, grey, 0, 0.75, 0, s);
    for (const x of [-4.6, 0, 4.6]) for (const z of [-0.6, 0.6]) box(0.12, 0.75, 0.12, grey, x, 0.37, z, s);
    for (let i = 0; i < 40; i++) this.slats.push(box(0.2, 0.04, 1.3, mat(0x56606a, { rough: 0.6 }), 0, 1.02, 0, s));
    // Parts: a flanged bushing — cylinder, collar and bore ring.
    for (let i = 0; i < 6; i++) {
      const p = new THREE.Group();
      cyl(0.28, 0.28, 0.4, mat(0x9aa6b0, { metal: 0.9, rough: 0.25 }), 0, 0.2, 0, p);
      cyl(0.4, 0.4, 0.08, mat(0xa8b4bd, { metal: 0.9, rough: 0.25 }), 0, 0.04, 0, p);
      const bore = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.04, 8, 24), mat(0x6b7680, { metal: 0.9, rough: 0.3 }));
      bore.rotation.x = Math.PI / 2;
      bore.position.y = 0.41;
      p.add(bore);
      p.position.set(0, 1.05, 0);
      s.add(p);
      this.parts.push(p);
    }

    // Inspection arch with a laser curtain.
    const arch = new THREE.Group();
    s.add(arch);
    box(0.25, 2.6, 0.25, white, 0.9, 1.3, -0.95, arch);
    box(0.25, 2.6, 0.25, white, 0.9, 1.3, 0.95, arch);
    box(0.4, 0.3, 2.2, white, 0.9, 2.6, 0, arch);
    box(0.06, 0.06, 1.7, glow(0x31d0ff, 2), 0.9, 2.44, 0, arch);
    this.laserMat = mat(0x000000, { emissive: 0x31d0ff, ei: 2, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
    this.laser = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.4), this.laserMat);
    this.laser.rotation.y = Math.PI / 2;
    this.laser.position.set(0.9, 1.75, 0);
    s.add(this.laser);

    // A two-joint robot arm with a magnifier, behind the line.
    const base = new THREE.Group();
    base.position.set(2.6, 0, -2);
    s.add(base);
    cyl(0.45, 0.55, 0.4, grey, 0, 0.2, 0, base);
    const upper = new THREE.Group();
    upper.position.y = 0.45;
    base.add(upper);
    sphere(0.22, white, 0, 0, 0, upper);
    box(0.22, 2, 0.22, white, 0, 1, 0, upper);
    const fore = new THREE.Group();
    fore.position.y = 2;
    upper.add(fore);
    sphere(0.18, grey, 0, 0, 0, fore);
    box(0.16, 1.6, 0.16, white, 0, 0.8, 0, fore);
    const lens = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 10, 32), grey);
    lens.position.y = 1.7;
    fore.add(lens);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.28, 32), mat(0xbfe9ff, { transparent: true, opacity: 0.35, rough: 0.05, metal: 0.2, side: THREE.DoubleSide }));
    glass.position.y = 1.7;
    fore.add(glass);
    this.arm = { base, upper, fore };

    // Bins: accepted (green rim) at the end of the line, findings (red) to the side.
    const binAt = (x: number, z: number, rim: number) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      s.add(g);
      box(1.4, 0.9, 1.2, white, 0, 0.45, 0, g);
      box(1.44, 0.06, 1.24, glow(rim, 1.6), 0, 0.92, 0, g);
      return g;
    };
    binAt(5.8, 0, 0x36d67a);
    this.bin = binAt(1.2, 2.6, 0xff2d4a);
    this.tag = box(0.16, 0.24, 0.02, glow(0xff2d4a, 2.5), 0, 0, 0, s);
    this.tag.visible = false;

    this.camera.position.set(9, 9, 9);
    this.camera.lookAt(0.5, 1, 0);
    this.camera.zoom = 1.25;
  }

  protected fit(aspect: number): void {
    const h = aspect < 1 ? 5 / aspect : 5;
    this.camera.top = h; this.camera.bottom = -h;
    super.fit(aspect);
  }

  protected tick(dt: number, t: number): void {
    const b = this.busy;
    this.beltPos += dt * b * 0.9;
    this.slats.forEach((sl, i) => { sl.position.x = (((i * BELT_LEN) / this.slats.length + this.beltPos) % BELT_LEN) - BELT_LEN / 2; });
    this.parts.forEach((p, i) => {
      if (p === this.reject) return;
      p.position.x = (((i * BELT_LEN) / this.parts.length + this.beltPos) % BELT_LEN) - BELT_LEN / 2;
      p.position.y = 1.05;
      p.position.z = 0;
    });
    // The laser sweeps while the belt runs.
    this.laser.visible = b > 0.05;
    this.laserMat.opacity = 0.15 + b * 0.3;
    this.laser.position.y = 1.75 + Math.sin(t * 3) * 0.45 * b;
    this.laser.scale.y = 0.3 + 0.2 * b;
    // The arm leans over whichever part is under the arch.
    this.arm.base.rotation.y = -0.6 + Math.sin(t * 0.5) * 0.15 * b;
    this.arm.upper.rotation.z = 0.5 + Math.sin(t * 0.7) * 0.08;
    this.arm.fore.rotation.z = 0.9 + Math.sin(t * 0.9) * 0.1 * b;

    if (this.reject && this.rejectT < 1) {
      this.rejectT = Math.min(1, this.rejectT + dt / 2.6);
      const k = this.rejectT;
      const mat0 = this.reject.children[0] as THREE.Mesh;
      const flash = k < 0.35 ? (Math.sin(k * 60) > 0 ? 1 : 0) : 1;
      (mat0.material as THREE.MeshStandardMaterial).emissive.setHex(0xff2d4a);
      (mat0.material as THREE.MeshStandardMaterial).emissiveIntensity = flash * 0.8;
      this.laserMat.emissive.setHex(0xff2d4a);
      if (k > 0.35) {
        const f = ease.inOut(clamp01((k - 0.35) / 0.65));
        const from = new THREE.Vector3(0.9, 1.05, 0);
        const to = this.bin.position.clone().add(new THREE.Vector3(0, 0.6, 0));
        this.reject.position.lerpVectors(from, to, f);
        this.reject.position.y += Math.sin(f * Math.PI) * 1.4;
        this.reject.rotation.z = f * 2.5;
        this.tag.visible = true;
        this.tag.position.copy(this.reject.position).add(new THREE.Vector3(0.3, 0.4, 0));
        this.tag.rotation.z = Math.sin(t * 8) * 0.3;
      }
      if (k >= 1) {
        (mat0.material as THREE.MeshStandardMaterial).emissiveIntensity = 0;
        this.laserMat.emissive.setHex(0x31d0ff);
        this.tag.visible = false;
        this.reject = null;
      }
    }
  }

  protected celebrate(_e: PublicEvent | null): void {
    // Flag whichever part is nearest the arch.
    let best = this.parts[0];
    for (const p of this.parts) if (Math.abs(p.position.x - 0.9) < Math.abs(best.position.x - 0.9)) best = p;
    this.reject = best;
    this.rejectT = 0;
  }
}
