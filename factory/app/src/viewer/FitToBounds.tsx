import { useEffect } from "react";
import { useReactFlow, useStore } from "@xyflow/react";
import type { FlowEdge, FlowNode } from "../layout.ts";
import type { Bounds } from "../types.ts";

export function FitToBounds({ bounds }: { bounds: Bounds | null }) {
  const { fitBounds } = useReactFlow<FlowNode, FlowEdge>();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const zoomReady = useStore((state) => Boolean(state.panZoom));
  const boundsKey = bounds ? `${bounds.x},${bounds.y},${bounds.width},${bounds.height}` : "";
  useEffect(() => {
    if (!bounds || !width || !height || !zoomReady) {
      return undefined;
    }
    const timer = setTimeout(() => fitBounds(bounds, { padding: 0.1 }), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundsKey, width, height, zoomReady, fitBounds]);
  return null;
}
