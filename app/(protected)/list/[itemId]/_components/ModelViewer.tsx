"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { MdOutlineLightMode, MdLightMode } from "react-icons/md";
import { CameraControls } from "@react-three/drei";
import { ArcRotateCamera, Vector3 } from "@babylonjs/core";
import { DefaultCanvas } from "@/components/3D_THREE/canvas";
import DefaultCanvasBabylon from "@/components/3D_BABYLON/canvas/DefaultCanvas";
import VerificationBadge from "./VerificationBadge";

interface ModelViewerProps {
  pathToCanvas: string;
  itemId: string;
}

const ModelViewer = ({ pathToCanvas, itemId }: ModelViewerProps) => {
  const [lightIntensity, setLightIntensity] = useState(3);
  const [renderThree, setRenderThree] = useState(true);
  const cameraControlsRef = useRef<CameraControls>(null);
  const [camera, setCamera] = useState<{
    camera: ArcRotateCamera;
    cameraPosition: Vector3;
    cameraTarget: Vector3;
  }>();

  const handleIntensityChange = (increment: boolean) => {
    setLightIntensity((prev) =>
      increment ? Math.min(prev + 1, 15) : Math.max(prev - 1, 1)
    );
  };

  const handleResetCamera = () => {
    if (renderThree) {
      cameraControlsRef.current?.reset(true);
    } else if (camera) {
      camera.camera.setTarget(camera.cameraTarget);
      camera.camera.setPosition(camera.cameraPosition);
    }
  };

  return (
    <>
      <div className="flex justify-center items-center gap-2">
        <Button onClick={() => handleIntensityChange(true)}>
          <MdLightMode className="w-5 h-5" />
        </Button>
        <Button onClick={() => handleIntensityChange(false)}>
          <MdOutlineLightMode className="w-5 h-5" />
        </Button>
        <Button onClick={handleResetCamera}>Reset</Button>
        <Button onClick={() => setRenderThree((prev) => !prev)}>
          Change Renderer
        </Button>
      </div>
      {renderThree ? (
        <DefaultCanvas
          pathToCanvas={pathToCanvas}
          lightIntensity={lightIntensity}
          cameraControlsRef={cameraControlsRef}
        />
      ) : (
        <DefaultCanvasBabylon
          pathToCanvas={pathToCanvas}
          lightIntensity={lightIntensity}
          setCamera={setCamera}
        />
      )}
      <div className="flex justify-center mt-1">
        <VerificationBadge itemId={itemId} pathToCanvas={pathToCanvas} />
      </div>
    </>
  );
};

export default ModelViewer;
