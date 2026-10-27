'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import gsap from 'gsap';
import { createBook, type BookMeshObject } from '@/components/BookMesh';
import type { Skill } from '@/lib/types';

export interface BookshelfSceneProps {
  skills: Skill[];
  selectedSlug: string | null;
  onHover: (skill: Skill | null) => void;
  onSelect: (skill: Skill) => void;
  onWebGLFail: () => void;
}

interface PlacedBook {
  skill: Skill;
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
}

interface Layout {
  books: PlacedBook[];
  rows: number;
  shelfWidth: number;
  shelfHeight: number;
  /** Y of the top of the tallest book, used to cap the frame. */
  contentTop: number;
}

const BOOK_DEPTH = 0.44;
const MAX_PER_SHELF = 12;
const SHELF_GAP = 2.15;
const SIDE_MARGIN = 0.55;

/** Stable 32-bit hash so book proportions never change between renders. */
function seedHash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

/**
 * Distribute books into rows, then size the shelf to hug its contents.
 *
 * Books are scaled so a row spans a comfortable width of the frame while
 * keeping book-like proportions (a spine is never wider than ~0.6x its
 * height). The cursor is reset per row so books in a row never overlap.
 */
function layoutBooks(skills: Skill[]): Layout {
  if (!skills.length) {
    return {
      books: [],
      rows: 1,
      shelfWidth: 6,
      shelfHeight: SHELF_GAP,
      contentTop: SHELF_GAP,
    };
  }

  // One row for a small collection, otherwise fill a shelf 12 at a time.
  const perShelf = skills.length <= 9 ? skills.length : MAX_PER_SHELF;
  const rows = Math.ceil(skills.length / perShelf);

  const gap = 0.05;

  const raw = skills.map((skill) => {
    const h = seedHash(skill.slug || skill.name || 'skill');
    const height = 1.5 + (h % 44) / 100; // 1.50 – 1.93
    const width = 0.2 + ((h >>> 8) % 18) / 100; // 0.20 – 0.37
    return { skill, height, width, y: 0, depth: BOOK_DEPTH };
  });

  // Width of each row at base scale.
  const rowWidths: number[] = [];
  for (let r = 0; r < rows; r += 1) {
    const row = raw.slice(r * perShelf, (r + 1) * perShelf);
    rowWidths.push(row.reduce((s, b) => s + b.width, 0) + Math.max(0, row.length - 1) * gap);
  }
  const widest = Math.max(...rowWidths);

  // Scale up so the widest row reads well on screen, but never so much that
  // a spine becomes wider than a third of its own height.
  const TARGET_ROW_WIDTH = 7.4;
  const scale = Math.min(
    TARGET_ROW_WIDTH / widest,
    raw.reduce((maxAllowed, b) => {
      const limit = (0.34 * b.height) / b.width;
      return Math.min(maxAllowed, limit);
    }, Infinity)
  );

  const books: PlacedBook[] = [];

  raw.forEach((b, i) => {
    const row = Math.floor(i / perShelf);
    const col = i % perShelf;
    const rowItems = raw.slice(row * perShelf, (row + 1) * perShelf);
    const rowWidth =
      rowItems.reduce((s, x) => s + x.width * scale, 0) + Math.max(0, rowItems.length - 1) * gap;

    // Centre this row, then walk it with a per-row cursor.
    let cursor = -rowWidth / 2;
    for (let c = 0; c < col; c += 1) {
      cursor += rowItems[c].width * scale + gap;
    }
    const width = b.width * scale;
    const x = cursor + width / 2;

    books.push({
      skill: b.skill,
      x,
      y: row * SHELF_GAP + b.height / 2,
      width,
      height: b.height,
      depth: b.depth,
    });
  });

  const shelfWidth = Math.max(widest * scale, 3.2) + SIDE_MARGIN * 2;
  const shelfHeight = (rows - 1) * SHELF_GAP + 2.3;

  // Top of the tallest book on the topmost shelf.
  const topRow = raw.slice((rows - 1) * perShelf);
  const contentTop = topRow.length
    ? (rows - 1) * SHELF_GAP + Math.max(...topRow.map((b) => b.height))
    : SHELF_GAP;

  return { books, rows, shelfWidth, shelfHeight, contentTop };
}

/** Imperative handle for the camera focus API, shared with the selection effect. */
const focusApi = { current: null as null | ((slug: string | null) => void) };

export default function BookshelfScene({
  skills,
  selectedSlug,
  onHover,
  onSelect,
  onWebGLFail,
}: BookshelfSceneProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null);

  // Latest props for the imperative scene, without re-creating it.
  const stateRef = useRef({ selectedSlug, onHover, onSelect });
  stateRef.current = { selectedSlug, onHover, onSelect };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // --- WebGL availability check --------------------------------------------
    let renderer: THREE.WebGLRenderer;
    try {
      const probe = document.createElement('canvas');
      const gl =
        probe.getContext('webgl2') ||
        probe.getContext('webgl') ||
        probe.getContext('experimental-webgl');
      if (!gl) {
        onWebGLFail();
        return;
      }
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      onWebGLFail();
      return;
    }

    const width = mount.clientWidth || 1280;
    const height = mount.clientHeight || 720;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    mount.appendChild(renderer.domElement);

    // --- Scene ---------------------------------------------------------------
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#14110d');
    scene.fog = new THREE.Fog('#14110d', 18, 44);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 150);
    camera.position.set(0, 2.4, 9);

    // --- Lighting ------------------------------------------------------------
    scene.add(new THREE.AmbientLight('#ffe9c9', 0.65));
    const key = new THREE.DirectionalLight('#fff3d6', 2.3);
    key.position.set(5, 9, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -16;
    key.shadow.camera.right = 16;
    key.shadow.camera.top = 16;
    key.shadow.camera.bottom = -4;
    key.shadow.bias = -0.0006;
    scene.add(key);

    const rim = new THREE.DirectionalLight('#88a6ff', 0.5);
    rim.position.set(-7, 4, -6);
    scene.add(rim);

    const lamp = new THREE.PointLight('#ffcf8f', 30, 30, 2);
    lamp.position.set(0, 5.6, 3.4);
    scene.add(lamp);

    // --- Layout ---------------------------------------------------------------
    const layout = layoutBooks(skills);
    const { books: placed, rows, shelfWidth, shelfHeight, contentTop } = layout;

    // --- Shelf structure -----------------------------------------------------
    const woodMat = new THREE.MeshStandardMaterial({ color: '#7a4e2a', roughness: 0.68 });
    const darkWoodMat = new THREE.MeshStandardMaterial({ color: '#5a3720', roughness: 0.8 });
    const backMat = new THREE.MeshStandardMaterial({ color: '#3a2716', roughness: 0.95 });

    // The carcass wraps the books: back panel, uprights, and one board per row.
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(shelfWidth, contentTop + 0.42, 0.14),
      backMat
    );
    back.position.set(0, contentTop / 2 - 0.06, -0.68);
    back.receiveShadow = true;
    scene.add(back);

    for (let r = 0; r < rows; r += 1) {
      const board = new THREE.Mesh(new THREE.BoxGeometry(shelfWidth, 0.17, 1.25), woodMat);
      board.position.set(0, r * SHELF_GAP - 0.085, 0.1);
      board.castShadow = true;
      board.receiveShadow = true;
      scene.add(board);

      // Front lip catches the light and hides the gap above the books.
      const lip = new THREE.Mesh(new THREE.BoxGeometry(shelfWidth, 0.13, 0.1), darkWoodMat);
      lip.position.set(0, r * SHELF_GAP - 0.145, 0.71);
      lip.castShadow = true;
      scene.add(lip);
    }

    // Uprights framing the shelf.
    [-1, 1].forEach((side) => {
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, contentTop + 0.5, 1.25),
        woodMat
      );
      panel.position.set(side * (shelfWidth / 2 - 0.12), contentTop / 2 - 0.08, 0.1);
      panel.castShadow = true;
      panel.receiveShadow = true;
      scene.add(panel);
    });

    // Top cap sitting just above the tallest book.
    const topCap = new THREE.Mesh(new THREE.BoxGeometry(shelfWidth + 0.1, 0.2, 1.35), woodMat);
    topCap.position.set(0, contentTop + 0.12, 0.1);
    topCap.castShadow = true;
    topCap.receiveShadow = true;
    scene.add(topCap);

    const plinth = new THREE.Mesh(new THREE.BoxGeometry(shelfWidth + 0.1, 0.22, 1.35), darkWoodMat);
    plinth.position.set(0, -0.11, 0.1);
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    scene.add(plinth);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({ color: '#241a10', roughness: 0.85 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.2;
    floor.receiveShadow = true;
    scene.add(floor);

    // --- Books ---------------------------------------------------------------
    const bookGroup = new THREE.Group();
    scene.add(bookGroup);

    const books = new Map<string, BookMeshObject>();
    placed.forEach((b) => {
      const book = createBook({
        skill: b.skill,
        width: b.width,
        height: b.height,
        depth: b.depth,
      });
      book.group.position.set(b.x, b.y, 0);
      book.baseY = b.y;
      book.baseZ = 0;
      books.set(b.skill.slug, book);
      bookGroup.add(book.group);
    });

    // --- Camera framing ------------------------------------------------------
    // Frame the books themselves, not the carcass around them.
    const vFov = (camera.fov * Math.PI) / 180;
    const frameHeight = contentTop + 0.45;
    const fitHeight = frameHeight / 2 / Math.tan(vFov / 2);
    const fitWidth = shelfWidth / 2 / Math.tan(vFov / 2) / camera.aspect;
    const homeDistance = Math.max(fitHeight, fitWidth) * 1.12 + 0.7;
    const homeLook = new THREE.Vector3(0, contentTop / 2 - 0.05, 0);
    const homePos = new THREE.Vector3(0, homeLook.y + 0.12, homeDistance);

    camera.position.copy(homePos);
    camera.lookAt(homeLook);

    // --- Raycasting ----------------------------------------------------------
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2(-2, -2);
    let pointerDirty = false;

    const pick = (): Skill | null => {
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(bookGroup.children, true);
      for (const hit of hits) {
        let obj: THREE.Object3D | null = hit.object;
        while (obj && !obj.userData.skill) obj = obj.parent;
        const skill = obj?.userData?.skill as Skill | undefined;
        if (skill) return skill;
      }
      return null;
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      pointerDirty = true;
    };

    const onClick = () => {
      const skill = pick();
      if (skill) stateRef.current.onSelect(skill);
    };

    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('click', onClick);

    // --- GSAP hover pull-out -------------------------------------------------
    const hoverTween = new Map<string, gsap.core.Tween>();
    let currentHover: string | null = null;

    const applyHover = (slug: string | null) => {
      if (currentHover === slug) return;
      const prev = currentHover;
      currentHover = slug;
      setHoveredSlug(slug);

      if (prev) {
        const book = books.get(prev);
        if (book) {
          hoverTween.get(prev)?.kill();
          const t = gsap.to(book.group.position, {
            z: book.baseZ,
            y: book.baseY,
            duration: 0.4,
            ease: 'power3.out',
          });
          hoverTween.set(prev, t);
        }
      }

      if (slug) {
        const book = books.get(slug);
        if (book) {
          hoverTween.get(slug)?.kill();
          const t = gsap.to(book.group.position, {
            z: book.baseZ + 0.62,
            y: book.baseY + 0.09,
            duration: 0.5,
            ease: 'back.out(2.4)',
          });
          hoverTween.set(slug, t);
        }
      }
      stateRef.current.onHover(slug ? books.get(slug)?.group.userData.skill ?? null : null);
    };

    // --- GSAP camera focus ---------------------------------------------------
    let focusTween: gsap.core.Tween | null = null;
    const lookTarget = { x: homeLook.x, y: homeLook.y, z: homeLook.z };
    const posTarget = { x: homePos.x, y: homePos.y, z: homePos.z };

    const focusCamera = (slug: string | null) => {
      focusTween?.kill();
      if (!slug) {
        focusTween = gsap.to(posTarget, {
          x: homePos.x,
          y: homePos.y,
          z: homePos.z,
          duration: 1.2,
          ease: 'power3.inOut',
          onUpdate: () => {
            camera.position.set(posTarget.x, posTarget.y, posTarget.z);
            camera.lookAt(lookTarget.x, lookTarget.y, lookTarget.z);
          },
        });
        gsap.to(lookTarget, {
          x: homeLook.x,
          y: homeLook.y,
          z: homeLook.z,
          duration: 1.2,
          ease: 'power3.inOut',
        });
        return;
      }
      const book = books.get(slug);
      if (!book) return;
      const target = new THREE.Vector3();
      book.group.getWorldPosition(target);
      const desired = target.clone().add(new THREE.Vector3(0, 0.28, 2.9));
      focusTween = gsap.to(posTarget, {
        x: desired.x,
        y: desired.y,
        z: desired.z,
        duration: 1.25,
        ease: 'power3.inOut',
        onUpdate: () => {
          camera.position.set(posTarget.x, posTarget.y, posTarget.z);
          camera.lookAt(lookTarget.x, lookTarget.y, lookTarget.z);
        },
      });
      gsap.to(lookTarget, {
        x: target.x,
        y: target.y,
        z: target.z,
        duration: 1.25,
        ease: 'power3.inOut',
      });
    };

    // Expose focus control to the outer component.
    focusApi.current = focusCamera;
    if (selectedSlug) setTimeout(() => focusCamera(selectedSlug), 80);

    // --- Render loop ---------------------------------------------------------
    let raf = 0;
    const clock = new THREE.Clock();

    const render = () => {
      raf = requestAnimationFrame(render);
      const elapsed = clock.getElapsedTime();

      if (pointerDirty) {
        pointerDirty = false;
        const skill = pick();
        applyHover(skill?.slug ?? null);
        renderer.domElement.style.cursor = skill ? 'pointer' : 'default';
      }

      // Gentle breathing motion so the shelf feels alive.
      bookGroup.position.y = Math.sin(elapsed * 0.55) * 0.014;
      lamp.intensity = 28 + Math.sin(elapsed * 1.4) * 2.5;

      renderer.render(scene, camera);
    };
    render();

    const onResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('click', onClick);
      focusTween?.kill();
      hoverTween.forEach((t) => t.kill());
      books.forEach((b) => b.dispose());
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((m) => (m as THREE.Material).dispose());
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      focusApi.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skills]);

  // Camera focus whenever the selection changes.
  useEffect(() => {
    focusApi.current?.(selectedSlug);
  }, [selectedSlug]);

  return (
    <div
      ref={mountRef}
      style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
      data-hovered={hoveredSlug ?? undefined}
    />
  );
}
