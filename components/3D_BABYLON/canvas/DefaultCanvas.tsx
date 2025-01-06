import React, {
  Dispatch,
  FC,
  SetStateAction,
  Suspense,
  useEffect,
  useRef,
} from "react";
import {
  Engine,
  Scene,
  ArcRotateCamera,
  HemisphericLight,
  Vector3,
  SceneLoader,
  Color4,
  Mesh,
} from "@babylonjs/core";
import "@babylonjs/loaders";
import CanvasLoader from "../../3D_THREE/Loader";

interface DefaultCanvasProps {
  pathToCanvas: string;
  lightIntensity: number;
  setCamera: Dispatch<
    SetStateAction<
      | {
          camera: ArcRotateCamera;
          cameraPosition: Vector3;
          cameraTarget: Vector3;
        }
      | undefined
    >
  >;
}

const DefaultCanvasBabylon: FC<DefaultCanvasProps> = ({
  pathToCanvas,
  lightIntensity,
  setCamera,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new Engine(canvasRef.current, true);
    const scene = new Scene(engine);

    scene.clearColor = new Color4(1, 1, 1, 0);

    const camera = new ArcRotateCamera(
      "ArcRotateCamera",
      Math.PI / 2,
      Math.PI / 4,
      10,
      Vector3.Zero(),
      scene
    );
    camera.attachControl(canvasRef.current, true);
    camera.maxZ = 10000;

    const cameraPosition = camera.position.clone();
    const cameraTarget = camera.target.clone();

    setCamera({ camera, cameraPosition, cameraTarget });

    const hemiLight = new HemisphericLight(
      "hemiLight",
      new Vector3(0, 1, 0),
      scene
    );
    hemiLight.intensity = lightIntensity;

    const loadModel = async () => {
      try {
        const path = pathToCanvas.slice(0, pathToCanvas.lastIndexOf("/")) + "/";
        const fileName = pathToCanvas.slice(pathToCanvas.lastIndexOf("/") + 1);

        const result = await SceneLoader.ImportMeshAsync(
          "",
          path,
          fileName,
          scene
        );

        // Disable animations
        if (result.animationGroups && result.animationGroups.length > 0) {
          result.animationGroups.forEach((group) => {
            group.stop();
            group.dispose();
          });
        }

        let min = new Vector3(
          Number.POSITIVE_INFINITY,
          Number.POSITIVE_INFINITY,
          Number.POSITIVE_INFINITY
        );
        let max = new Vector3(
          Number.NEGATIVE_INFINITY,
          Number.NEGATIVE_INFINITY,
          Number.NEGATIVE_INFINITY
        );

        result.meshes.forEach((mesh) => {
          if (mesh instanceof Mesh) {
            const boundingInfo = mesh.getBoundingInfo();
            min = Vector3.Minimize(min, boundingInfo.boundingBox.minimumWorld);
            max = Vector3.Maximize(max, boundingInfo.boundingBox.maximumWorld);
          }
        });

        const size = max.subtract(min);
        const maxDimension = Math.max(size.x, size.y, size.z);
        const desiredSize = 5;
        const scaleFactor = desiredSize / maxDimension;
        const center = min.add(max).scale(0.5);

        result.meshes[0].scaling = new Vector3(
          scaleFactor,
          scaleFactor,
          scaleFactor
        );

        center.y -= size.y * 0.5 * scaleFactor;
        result.meshes[0].position = center;
        result.meshes[0].position.y -= size.y * 0.2 * scaleFactor;
        result.meshes[0].rotation = new Vector3(0, Math.PI, 0);

        camera.lowerRadiusLimit = desiredSize * 0.5;
        camera.upperRadiusLimit = desiredSize * 5;

      } catch (error) {
        console.error("Error loading the .glb file:", error);
      }
    };
    
    loadModel();

    engine.runRenderLoop(() => {
      scene.render();
    });

    window.addEventListener("resize", () => {
      engine.resize();
    });

    return () => {
      engine.dispose();
      window.removeEventListener("resize", () => engine.resize());
    };
  }, [pathToCanvas, lightIntensity, setCamera]);

  return (
    <Suspense fallback={<CanvasLoader />}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block" }}
      />
    </Suspense>
  );
};

export default DefaultCanvasBabylon;
