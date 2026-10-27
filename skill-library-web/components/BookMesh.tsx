import * as THREE from 'three';
import { jitterColor, spineStyle } from '@/lib/color';
import type { Skill } from '@/lib/types';

export interface BookMeshOptions {
  skill: Skill;
  width: number;
  height: number;
  depth: number;
}

export interface BookMeshObject {
  group: THREE.Group;
  baseY: number;
  baseZ: number;
  dispose: () => void;
}

/**
 * Draw the book title onto a portrait canvas.
 * The spine face of a box maps u→width, v→height, so a portrait canvas
 * keeps the text upright and legible along the spine.
 */
function makeSpineTexture(title: string, baseColor: string, accent: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 256, 512);

  // Cloth-binding sheen across the spine.
  const grad = ctx.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0.22)');
  grad.addColorStop(0.28, 'rgba(0,0,0,0.10)');
  grad.addColorStop(0.72, 'rgba(0,0,0,0.10)');
  grad.addColorStop(1, 'rgba(255,255,255,0.16)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 512);

  // Gold bands framing the spine.
  ctx.fillStyle = 'rgba(212,175,55,0.9)';
  ctx.fillRect(0, 16, 256, 6);
  ctx.fillRect(0, 490, 256, 6);

  // Title wrapped to the narrow spine width.
  ctx.font = 'bold 42px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#F6E7B0';
  ctx.shadowColor = 'rgba(0,0,0,0.65)';
  ctx.shadowBlur = 8;

  const maxWidth = 206;
  const words = title.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    const attempt = current ? `${current} ${w}` : w;
    if (ctx.measureText(attempt).width > maxWidth && current) {
      lines.push(current);
      current = w;
    } else {
      current = attempt;
    }
  }
  if (current) lines.push(current);

  const shown = lines.slice(0, 4);
  shown.forEach((line, i) => {
    ctx.fillText(line, 128, 256 + (i - (shown.length - 1) / 2) * 50);
  });
  ctx.shadowBlur = 0;

  // Small accent block under the title.
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.5;
  ctx.fillRect(96, 300, 64, 3);
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Build a book as a THREE.Group: a box whose +z face is the spine
 * (carrying the title texture) plus a slightly inset page block.
 */
export function createBook({ skill, width, height, depth }: BookMeshOptions): BookMeshObject {
  const seed = skill.slug || skill.name || 'skill';
  const style = spineStyle(seed);
  const bodyColor = jitterColor(style.color, seed);
  const accent = jitterColor(style.accent, `${seed}-accent`);

  const texture = makeSpineTexture(skill.name || skill.slug || 'Untitled', bodyColor, accent);

  const spineMat = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: style.roughness,
    metalness: 0.04,
  });
  const coverMat = new THREE.MeshStandardMaterial({
    color: bodyColor,
    roughness: 0.88,
    metalness: 0.02,
  });
  const pageMat = new THREE.MeshStandardMaterial({
    color: '#EFE7D2',
    roughness: 0.96,
  });

  const group = new THREE.Group();
  group.userData.skill = skill;

  // BoxGeometry material order: +x, -x, +y, -y, +z, -z → spine is +z.
  const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), [
    coverMat,
    coverMat,
    coverMat,
    coverMat,
    spineMat,
    coverMat,
  ]);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Page block peeking past the covers.
  const pages = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.86, height * 0.93, depth * 1.02),
    pageMat
  );
  group.add(pages);

  // A thin band near the bottom of the spine reads as a title flourish.
  const band = new THREE.Mesh(
    new THREE.BoxGeometry(width * 1.04, height * 0.02, depth * 1.04),
    new THREE.MeshStandardMaterial({ color: accent, roughness: 0.6 })
  );
  band.position.y = -height * 0.34;
  group.add(band);

  return {
    group,
    baseY: 0,
    baseZ: 0,
    dispose: () => {
      texture.dispose();
      spineMat.dispose();
      coverMat.dispose();
      pageMat.dispose();
      band.geometry.dispose();
      (band.material as THREE.Material).dispose();
      body.geometry.dispose();
      pages.geometry.dispose();
    },
  };
}
