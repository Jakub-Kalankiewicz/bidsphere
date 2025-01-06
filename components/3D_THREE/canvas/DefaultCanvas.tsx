import React, { LegacyRef, Suspense, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";

import { useGLTF, Preload, CameraControls } from "@react-three/drei";

import CanvasLoader from "../Loader";
import { Box3, Group, Vector3 } from "three";

interface DefaultProps {
  pathToCanvas: string;
  lightIntensity: number;
  cameraControlsRef: LegacyRef<CameraControls>;
}

interface DefaultCanvasProps {
  pathToCanvas: string;
  lightIntensity: number;
  cameraControlsRef: LegacyRef<CameraControls>;
}

const Default = ({
  pathToCanvas,
  lightIntensity,
  cameraControlsRef,
}: DefaultProps) => {
  const gltf = useGLTF(pathToCanvas);
  const groupRef = useRef<Group>(null);

  useEffect(() => {
    if (gltf.scene && groupRef.current) {
      const bbox = new Box3().setFromObject(gltf.scene);
      const center = bbox.getCenter(new Vector3()).multiplyScalar(-1);
      const size = bbox.getSize(new Vector3());
      const maxDimension = Math.max(size.x, size.y, size.z);
      const desiredMaxDimension = 5;
      const scale = desiredMaxDimension / maxDimension;

      groupRef.current.scale.set(scale, scale, scale);

      center.y -= size.y * 0.5 * scale;
      groupRef.current.position.copy(center);
    }
  }, [gltf]);

  return (
    <group ref={groupRef} position-y={-0.5}>
      <ambientLight intensity={lightIntensity} />
      <CameraControls
        ref={cameraControlsRef}
        minDistance={1}
        maxDistance={10}
      />
      <mesh>
        <primitive object={gltf.scene} />
      </mesh>
    </group>
  );
};

const DefaultCanvas: React.FC<DefaultCanvasProps> = ({
  pathToCanvas,
  lightIntensity,
  cameraControlsRef,
}) => {
  return (
    <Canvas>
      <Suspense fallback={<CanvasLoader />}>
        <Default
          pathToCanvas={pathToCanvas}
          lightIntensity={lightIntensity}
          cameraControlsRef={cameraControlsRef}
        />
      </Suspense>
      <Preload all />
    </Canvas>
  );
};

export default DefaultCanvas;
