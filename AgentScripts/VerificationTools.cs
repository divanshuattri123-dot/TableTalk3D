using System;
using System.Collections.Generic;
using System.Reflection;
using System.IO;
using System.Threading.Tasks;
using UnityEditor;
using UnityEngine;

public static class VerificationTools
{
    public static async Task<string> CheckRenderedMaps()
    {
        var controller = UnityEngine.Object.FindAnyObjectByType<TableTalk.TableTalkPresentation>();
        if (controller == null || !Application.isPlaying) throw new Exception("Run the TableTalk scene first.");
        var report = new List<string>();
        foreach (int size in new[] { 48, 56, 64 })
        {
            var state = JsonUtility.FromJson<TableTalk.BoardSnapshot>(File.ReadAllText(Path.Combine(Application.dataPath, "../AgentScripts/Snapshots/" + size + ".json")));
            state.players[0].position = size / 4; state.players[0].inJail = true;
            controller.ApplySnapshot(JsonUtility.ToJson(state));
            await Task.Delay(150);
            int tiles = UnityEngine.Object.FindObjectsByType<TableTalk.TilePick>().Length;
            if (tiles != size) throw new Exception("Rendered tile count mismatch for " + size + ": " + tiles);
            if ((controller.jailBars.transform.position - TableTalk.BoardLayout.Point(size / 4, size) - controller.jailMeshOffset).sqrMagnitude > .001f)
                throw new Exception("Jail corner mismatch for " + size);
            if (!controller.jailBars.activeSelf) throw new Exception("Jail cage missing for " + size);
            report.Add(size + " tiles and jail corner verified");
        }
        controller.ApplySnapshot(controller.previewSnapshot.text);
        await Task.Delay(150);
        if (UnityEngine.Object.FindObjectsByType<TableTalk.TilePick>().Length != 40) throw new Exception("Classic preview did not restore.");
        report.Add("40-tile classic preview restored");
        return string.Join("; ", report);
    }

    public static string SetGameView(int width, int height)
    {
        var assembly = typeof(UnityEditor.Editor).Assembly;
        var sizesType = assembly.GetType("UnityEditor.GameViewSizes");
        var sizes = sizesType.GetProperty("instance", BindingFlags.Static | BindingFlags.Public | BindingFlags.FlattenHierarchy).GetValue(null);
        var groupType = sizesType.GetProperty("currentGroupType", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic).GetValue(sizes);
        var group = sizesType.GetMethod("GetGroup").Invoke(sizes, new[] { groupType });
        var sizeType = assembly.GetType("UnityEditor.GameViewSize");
        var modeType = assembly.GetType("UnityEditor.GameViewSizeType");
        var constructor = sizeType.GetConstructor(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic, null,
            new[] { modeType, typeof(int), typeof(int), typeof(string) }, null);
        var size = constructor.Invoke(new object[] { Enum.Parse(modeType, "FixedResolution"), width, height, "TableTalk verification " + width + "x" + height });
        group.GetType().GetMethod("AddCustomSize").Invoke(group, new[] { size });
        int count = (int)group.GetType().GetMethod("GetTotalCount").Invoke(group, null);
        var viewType = assembly.GetType("UnityEditor.GameView");
        var view = EditorWindow.GetWindow(viewType);
        viewType.GetProperty("selectedSizeIndex", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic).SetValue(view, count - 1);
        view.Repaint();
        return "Game view set to " + width + "x" + height + " in " + groupType;
    }

    public static string CheckLayouts()
    {
        int assertions = 0;
        foreach (int size in new[] { 40, 48, 56, 64 })
        {
            var points = new HashSet<Vector3>();
            for (int index = 0; index < size; index++)
            {
                var point = TableTalk.BoardLayout.Point(index, size);
                if (!points.Add(point)) throw new Exception("Duplicate tile position at " + size + ":" + index);
                var dimensions = TableTalk.BoardLayout.Size(index, size);
                bool corner = index % (size / 4) == 0;
                if (corner && (dimensions.x != 1.5f || dimensions.z != 1.5f)) throw new Exception("Corner size mismatch.");
                if (Mathf.Abs(point.x) + dimensions.x / 2 > TableTalk.BoardLayout.Span(size) / 2 + .001f) throw new Exception("Tile outside board.");
                assertions += 3;
            }
            if (TableTalk.BoardLayout.ForwardSteps(size - 1, 1, size) != 2) throw new Exception("GO wrap mismatch.");
            if (TableTalk.BoardLayout.ForwardSteps(5, 5, size) != 0) throw new Exception("Stationary movement mismatch.");
            assertions += 2;
        }
        return assertions + " layout assertions passed across 40, 48, 56 and 64 spaces.";
    }
}
