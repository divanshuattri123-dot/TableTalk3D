using System;
using UnityEngine;

namespace TableTalk
{
    [Serializable] public class ScreenLabelAnchor
    {
        public int id;
        public float x, y, w, h;
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
                foreach (var corner in labelCorners)
                {
                    var point = boardCamera.WorldToViewportPoint(corner); inFront &= point.z > 0;
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
            if (!webMode || !screenLabels || shown == null) return;
            var matrix = boardCamera.projectionMatrix * boardCamera.worldToCameraMatrix;
            if (!labelPositionsDirty && lastLabelBoardSize == shown.boardSize && matrix == lastLabelMatrix) return;
            labelPositionsDirty = false; lastLabelBoardSize = shown.boardSize; lastLabelMatrix = matrix;
            // Project after camera input in the same frame; throttling made signs lag behind dragged tiles.
            EmitWeb("labels", JsonUtility.ToJson(ProjectScreenLabels()));
        }
    }
}
