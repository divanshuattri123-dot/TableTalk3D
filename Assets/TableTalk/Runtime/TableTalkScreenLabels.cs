using System;
using UnityEngine;

namespace TableTalk
{
    [Serializable] public class ScreenLabelAnchor
    {
        public int id;
        public float x, y, w, h;
        public float localWidth, localHeight;
        public Vector2[] corners = new Vector2[4];
        public bool visible;
    }
    [Serializable] public class ScreenLabelPacket
    {
        public int size;
        public ScreenLabelAnchor[] labels;
    }

    public partial class TableTalkPresentation
    {
        bool screenLabels, labelPositionsDirty;
        Matrix4x4 lastLabelMatrix;
        int lastLabelBoardSize;
        ScreenLabelPacket projectedLabels;
        readonly Vector3[] labelCorners = new Vector3[4];

        void ConfigureScreenLabels(bool enabled)
        {
            screenLabels = enabled; labelPositionsDirty = true;
            foreach (var label in tileLabels.Values) label.enabled = !enabled;
        }

        public ScreenLabelPacket ProjectScreenLabels()
        {
            if (projectedLabels == null || projectedLabels.size != shown.boardSize)
            {
                projectedLabels = new ScreenLabelPacket { size = shown.boardSize, labels = new ScreenLabelAnchor[shown.tiles.Length] };
                for (int i = 0; i < shown.tiles.Length; i++) projectedLabels.labels[i] = new ScreenLabelAnchor { id = shown.tiles[i].id };
            }
            var packet = projectedLabels;
            for (int i = 0; i < shown.tiles.Length; i++)
            {
                int id = shown.tiles[i].id;
                var anchor = packet.labels[i];
                if (!tileLabels.TryGetValue(id, out var label)) continue;
                label.rectTransform.GetWorldCorners(labelCorners);
                var min = Vector2.one * float.MaxValue; var max = Vector2.one * float.MinValue;
                bool inFront = true;
                anchor.localWidth = label.rectTransform.rect.width;
                anchor.localHeight = label.rectTransform.rect.height;
                for (int corner = 0; corner < 4; corner++)
                {
                    // CSS and SVG start at top-left; Unity's rect corners start at bottom-left.
                    var point = boardCamera.WorldToViewportPoint(labelCorners[(corner + 1) % 4]); inFront &= point.z > 0;
                    anchor.corners[corner] = new Vector2(point.x, 1 - point.y);
                    min = Vector2.Min(min, point); max = Vector2.Max(max, point);
                }
                anchor.x = (min.x + max.x) * .5f; anchor.y = 1 - (min.y + max.y) * .5f;
                anchor.w = max.x - min.x; anchor.h = max.y - min.y;
                anchor.visible = inFront && max.x > 0 && min.x < 1 && max.y > 0 && min.y < 1;
            }
            return packet;
        }

        void PublishScreenLabels()
        {
            // A skipped 3D frame must not leave its HTML labels one camera pose ahead.
            if (!webMode || !screenLabels || shown == null || !UnityEngine.Rendering.OnDemandRendering.willCurrentFrameRender) return;
            var matrix = boardCamera.projectionMatrix * boardCamera.worldToCameraMatrix;
            if (!labelPositionsDirty && lastLabelBoardSize == shown.boardSize && matrix == lastLabelMatrix) return;
            labelPositionsDirty = false; lastLabelBoardSize = shown.boardSize; lastLabelMatrix = matrix;
            // Project after camera input in the same frame; throttling made signs lag behind dragged tiles.
            EmitWeb("labels", JsonUtility.ToJson(ProjectScreenLabels()));
        }
    }
}
