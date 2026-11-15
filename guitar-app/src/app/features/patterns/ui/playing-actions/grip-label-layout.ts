/** Measured in CSS pixels, after the notation segments have wrapped. */
export interface MeasuredGripLabel {
  actionIndex: number;
  row: number;
  anchorX: number;
  width: number;
  height: number;
}

export interface GripLabelPlacement extends MeasuredGripLabel {
  left: number;
  /** Distance above the bottom of the label band. */
  bottom: number;
  leader: boolean;
}

const EDGE_PADDING = 4;
const LABEL_GAP = 6;
const LANE_GAP = 4;

/** Pack full names into lanes without moving the musical action positions. */
export function layoutGripLabels(labels: MeasuredGripLabel[], rowWidth: number): {
  bandHeight: number;
  placements: GripLabelPlacement[];
} {
  const rows = new Map<number, MeasuredGripLabel[]>();
  for (const label of labels) {
    const row = rows.get(label.row) ?? [];
    row.push(label);
    rows.set(label.row, row);
  }

  let bandHeight = 15;
  const placements: GripLabelPlacement[] = [];
  for (const row of rows.values()) {
    const lanes: { right: number; height: number }[] = [];
    const packed = [...row].sort((a, b) => a.anchorX - b.anchorX).map(label => {
      const left = Math.max(EDGE_PADDING, Math.min(
        label.anchorX - label.width / 2,
        rowWidth - EDGE_PADDING - label.width
      ));
      let lane = lanes.findIndex(candidate => candidate.right + LABEL_GAP <= left);
      if (lane < 0) {
        lane = lanes.length;
        lanes.push({ right: 0, height: 0 });
      }
      lanes[lane].right = left + label.width;
      lanes[lane].height = Math.max(lanes[lane].height, label.height);
      return { label, left, lane };
    });

    const bottoms: number[] = [];
    let height = 0;
    for (const lane of lanes) {
      bottoms.push(height);
      height += lane.height + LANE_GAP;
    }
    bandHeight = Math.max(bandHeight, height);
    for (const { label, left, lane } of packed) {
      placements.push({
        ...label, left, bottom: bottoms[lane],
        leader: lane > 0 || Math.abs(left + label.width / 2 - label.anchorX) > 0.5
      });
    }
  }

  return { bandHeight, placements };
}
