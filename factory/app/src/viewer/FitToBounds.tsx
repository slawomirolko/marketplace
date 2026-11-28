import { useEffect } from "react";
import { useReactFlow, useStore } from "@xyflow/react";
import type { FlowEdge, FlowNode } from "../layout.ts";
import type { Bounds } from "../types.ts";

/** Margin around the fitted bounds, as a share of the viewport. */
const FIT_PADDING = 0.1;

/** Zooms the viewport to the bounds once React Flow has a size and a pan-zoom instance, and again whenever the bounds change. */
export function FitToBounds({ bounds }: { bounds: Bounds | null }) {
  const { fitBounds } = useReactFlow<FlowNode, FlowEdge>();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const zoomReady = useStore((state) => Boolean(state.panZoom));
  const boundsKey = bounds ? `${bounds.x},${bounds.y},${bounds.width},${bounds.height}` : "";
  /**
   * The effect keys on `boundsKey`, the bounds as text, instead of `bounds`: the layout builds a new bounds object on
   * every render, so depending on the object would fit the view again after each render and undo the user's pan and
   * zoom. The fit is deferred with setTimeout(0) so it runs after React Flow has applied the new nodes and viewport
   * size of this render; fitting in the same tick uses the previous size.
   */
  useEffect(() => {
    if (!bounds || !width || !height || !zoomReady) {
      return undefined;
    }
    const timer = setTimeout(() => fitBounds(bounds, { padding: FIT_PADDING }), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundsKey, width, height, zoomReady, fitBounds]);
  return null;
}
