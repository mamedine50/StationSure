'use client';

import { COULEUR_PRODUIT } from '@stationsure/core';
import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useMemo } from 'react';
import { Plane, Vector3 } from 'three';

import { hauteurPourFraction, type NiveauCuve } from './niveau';

const RAYON = 1;
const LONGUEUR = 4.2;

function Cylindre({ niveau }: { niveau: NiveauCuve }) {
  const fraction = niveau.mesureCl === null ? 0 : Math.min(1, niveau.mesureCl / niveau.capaciteCl);
  const yLiquide = -RAYON + hauteurPourFraction(fraction) * 2 * RAYON;
  const yTheo =
    niveau.theoriqueCl === null
      ? null
      : -RAYON +
        hauteurPourFraction(Math.min(1, niveau.theoriqueCl / niveau.capaciteCl)) * 2 * RAYON;
  const ySeuil = -RAYON + hauteurPourFraction(niveau.seuilCl / niveau.capaciteCl) * 2 * RAYON;
  // Le liquide est un cylindre plein coupé par un plan horizontal à la hauteur mesurée.
  const plans = useMemo(() => [new Plane(new Vector3(0, -1, 0), yLiquide)], [yLiquide]);
  const couleur = COULEUR_PRODUIT[niveau.produit];
  const gris = niveau.mesureCl === null;
  return (
    <group rotation={[0, 0, Math.PI / 2]}>
      {!gris && (
        <mesh>
          <cylinderGeometry args={[RAYON * 0.985, RAYON * 0.985, LONGUEUR * 0.985, 48]} />
          <meshStandardMaterial
            color={couleur}
            clippingPlanes={plans}
            clipShadows
            roughness={0.35}
            metalness={0.05}
          />
        </mesh>
      )}
      <mesh>
        <cylinderGeometry args={[RAYON, RAYON, LONGUEUR, 48, 1, false]} />
        <meshPhysicalMaterial
          color={gris ? '#2a3530' : '#5b6b66'}
          transparent
          opacity={gris ? 0.85 : 0.28}
          roughness={0.2}
          metalness={0.4}
          side={2}
        />
      </mesh>
      {/* Anneaux : niveau théorique (blanc pointillé) et seuil de commande (ambre). */}
      {yTheo !== null && (
        <mesh position={[yTheo, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[RAYON * 1.005, 0.012, 8, 64]} />
          <meshBasicMaterial color="#EEF2EF" transparent opacity={0.9} />
        </mesh>
      )}
      <mesh position={[ySeuil, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[RAYON * 1.01, 0.014, 8, 64]} />
        <meshBasicMaterial color="#F2A541" />
      </mesh>
      {/* Trappe */}
      <mesh position={[RAYON + 0.08, 0, 0]}>
        <cylinderGeometry args={[0.18, 0.18, 0.16, 24]} />
        <meshStandardMaterial color="#3a4642" />
      </mesh>
    </group>
  );
}

/** Vue 3D (react-three-fiber) : rotation limitée à la souris / au doigt, sans zoom ni déplacement. */
export default function Cuve3D({ niveau }: { niveau: NiveauCuve }) {
  return (
    <Canvas
      camera={{ position: [3.2, 1.6, 4.6], fov: 38 }}
      gl={{ localClippingEnabled: true, antialias: true, alpha: true }}
      dpr={[1, 1.5]}
      style={{ width: '100%', height: 260, touchAction: 'none' }}
    >
      <ambientLight intensity={0.9} />
      <directionalLight position={[4, 6, 5]} intensity={1.2} />
      <directionalLight position={[-4, 2, -3]} intensity={0.4} />
      <Cylindre niveau={niveau} />
      <mesh position={[0, -RAYON - 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[2.6, 48]} />
        <meshBasicMaterial color="#000" transparent opacity={0.35} />
      </mesh>
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        minPolarAngle={Math.PI / 3.2}
        maxPolarAngle={Math.PI / 1.9}
        minAzimuthAngle={-Math.PI / 2.2}
        maxAzimuthAngle={Math.PI / 2.2}
        rotateSpeed={0.6}
      />
    </Canvas>
  );
}
