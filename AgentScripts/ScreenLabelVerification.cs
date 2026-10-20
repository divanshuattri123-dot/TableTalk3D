using System;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using TableTalk;
using TMPro;
using UnityEngine;

public static class ScreenLabelVerification
{
    public static async Task<object> Run()
    {
        if (!Application.isPlaying) throw new Exception("Run the TableTalk scene first.");
        var controller = UnityEngine.Object.FindAnyObjectByType<TableTalkPresentation>();
        int labels = 0, firstFrame = Time.frameCount;
        foreach (int size in new[] { 40, 48, 56, 64 })
        {
            controller.ResetSnapshot(File.ReadAllText(size == 40 ? "Assets/TableTalk/Art/PreviewSnapshot.json" : "AgentScripts/Snapshots/" + size + ".json"));
            controller.SetVisualSettings("{\"quality\":\"auto\",\"theme\":\"day\",\"camera\":\"top\",\"mobile\":true,\"screenLabels\":true}");
            await Task.Delay(800);
            var packet = controller.ProjectScreenLabels();
            if (packet.size != size || packet.labels.Length != size) throw new Exception("Label count mismatch for " + size);
            if (packet.labels.Any(label => !label.visible || label.w <= 0 || label.h <= 0 || label.x < 0 || label.x > 1 || label.y < 0 || label.y > 1)) throw new Exception("Invalid projected label on " + size + "-space board.");
            if (GameObject.Find("Readable board").GetComponentsInChildren<TextMeshPro>().Any(text => text.enabled)) throw new Exception("Duplicate world text is still enabled.");
            labels += packet.labels.Length;
        }
        controller.ResetSnapshot(File.ReadAllText("Assets/TableTalk/Art/PreviewSnapshot.json"));
        await Task.Delay(800);
        float before = controller.ProjectScreenLabels().labels[0].w;
        controller.ZoomIn(); await Task.Delay(800);
        float after = controller.ProjectScreenLabels().labels[0].w;
        if (after <= before * 1.1f) throw new Exception("Labels did not follow the zoomed camera.");
        controller.SetVisualSettings("{\"quality\":\"auto\",\"theme\":\"day\",\"camera\":\"top\",\"screenLabels\":false}");
        if (GameObject.Find("Readable board").GetComponentsInChildren<TextMeshPro>().Any(text => !text.enabled)) throw new Exception("Desktop world text was not restored.");
        return new { labels, zoomBefore = before, zoomAfter = after, frames = Time.frameCount - firstFrame };
    }
}
